var SphericalMercator = require('sphericalmercator');
var geojsonExtent = require('geojson-extent');
var geojsonVt = require('geojson-vt');
var vtpbf = require('vt-pbf');
var fs = require("fs");
var AWS = require("aws-sdk");
var minimist = require('minimist');
var getCentroidFeatures = require('./centroids');

// command line arguments
var argv = minimist(process.argv.slice(2), {
  alias: { d: 'data', o: 'out', z: 'zoom' },
  default: { z: '15', o: 'tiles/' }
});

var input = argv.d;
var output = argv.o;
var zoom = argv.z;
var s3public = argv.s3public;
var generateCentroids = argv.centroids;

if (!input) {
  console.log('\ngeojson-vt-cli: create tiles from GeoJSON');
  console.log('Need to specify path to GeoJSON data; aborting.');
  console.log('Options:');
  console.log('-d, --data\tpath to GeoJOSN file');
  console.log('-o, --out\tpath for output (default local\'/tiles\'), use \'s3://path/to/bucket\' for S3');
  console.log('--s3public\tif writing to S3, set \'public-read\' ACL on output objects');
  console.log('-z, --zoom\tmax zoom to tile to (default 15)');
  console.log('--centroids\tgenerate centroid features for polygons (w/property \'centroid: true\')');
  console.log('Example: node tile.js --data=path/to/data.geojson\n');
  return;
}

// remove trailing slash from output
output = output[output.length-1] === '/' ? output.slice(0, -1) : output;

// writing to S3?
var S3, s3params = {}, s3uri = 's3://';
if (output.toLowerCase().indexOf(s3uri) === 0) {
  S3 = new AWS.S3();
  output = output.slice(output.toLowerCase().indexOf(s3uri) + s3uri.length);
  if (s3public) {
    s3params['ACL'] = 'public-read';
  }
}

// read input file
var geojson = JSON.parse(fs.readFileSync(input));

// Create output directory
if (!S3) {
  if (!fs.existsSync(output)){
    fs.mkdirSync(output);
  }
  else {
    // TODO: check for/create S3 bucket
  }
}

console.log('Writing files to ' + output);

// optionally generate centroids for polygons
if (generateCentroids) {
  if (geojson.type === 'FeatureCollection') {
    var centroids = getCentroidFeatures(geojson.features);
    Array.prototype.push.apply(geojson.features, centroids);
  }
}

// geojson-vt setup
var tileOptions = {
    maxZoom: 15,  // max zoom to preserve detail on
    tolerance: 1.5, // simplification tolerance (higher means simpler)
    extent: 4096, // tile extent (both width and height)
    buffer: 0,   // tile buffer on each side
    debug: 1,      // logging level (0 to disable, 1 or 2)

    indexMaxZoom: 0,        // max zoom in the initial tile index
    indexMaxPoints: 100000, // max number of points per tile in the index
};
var tileindex = geojsonVt(geojson, tileOptions);

var start_zoom = 0;
var end_zoom = zoom;
var start_x, end_x, start_y, end_y;
var tile_count = 0;
var merc = new SphericalMercator({ size: 256 }); // for mercator math
var bounds = geojsonExtent(geojson); // latlng bounds of geometry

for (var z = start_zoom; z <= end_zoom; z++) {
  // Get tile bounds of geometry at current zoom
  var tile_bounds = merc.xyz(bounds, z);
  var candidate_count = (tile_bounds.maxX - tile_bounds.minX + 1) * (tile_bounds.maxY - tile_bounds.minY + 1);
  var tile_zoom_count = 0;
  console.log('Zoom ' + z + ', ' + candidate_count + ' candidate tiles');

  // Create 'z' directory (only if writing locally)
  if (!S3 && !fs.existsSync(output + '/' + z + '/')){
      fs.mkdirSync(output + '/' + z + '/');
  }

  // Scan tile rows/columns
  start_x = tile_bounds.minX;
  start_y = tile_bounds.minY;
  end_x = tile_bounds.maxX;
  end_y = tile_bounds.maxY;

  for (var x = start_x; x <= end_x; x++) {
    for (var y = start_y; y <= end_y; y++) {
      var tile = tileindex.getTile(z, x, y);
      if (!tile) {
        // console.log('NO TILE AT: ' + z + ', ' + x + ', ' + y + ' (skipping)');
        continue;
      }

      var data = vtpbf.fromGeojsonVt({ 'default': tile }); // TODO: add option for layer name
      if (!data) {
        console.error('ERROR CREATING TILE DATA AT ' + z + ', ' + x + ', ' + y);
        continue;
      }
      writeTile(output, x, y, z, data);
      tile_zoom_count++;
    }
  }

  tile_count += tile_zoom_count;
  console.log('Finished zoom ' + z + ', ' + tile_zoom_count + ' tiles generated');
}

console.log('-----\nTotal tiles generated:', tile_count);

// --- end main ---

// write a single tile, to local file system or S3
function writeTile (root, x, y, z, data) {
  var xdir = root + '/' + z + '/' + x;
  var path = xdir + '/' + y + '.mvt';

  // write to local file
  if (!S3) {
    // Create 'x' directory
    if (!fs.existsSync(xdir)){
        fs.mkdirSync(xdir);
    }

    fs.writeFileSync(path, data);
  }
  // write to S3
  else {
    // extract string before first slash as S3 bucket
    var bucket = root;
    if (bucket.indexOf('/') > -1) {
      path = path.slice(bucket.indexOf('/') + 1);
      bucket = bucket.slice(0, bucket.indexOf('/'));
    }

    S3.putObject(Object.assign({}, s3params, {
      Body: data,
      Bucket: bucket,
      Key: path,
      ContentType: 'application/x-protobuf'
    }), function(err, ret) {
      if (err) {
        console.error('Error writing to S3!', bucket, path);
      }
    });
  }
}
