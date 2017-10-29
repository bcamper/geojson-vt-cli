var SphericalMercator = require('sphericalmercator');
var geojsonExtent = require('geojson-extent');
var geojsonVt = require('geojson-vt');
var vtpbf = require('vt-pbf');
var fs = require("fs");
var argv = require('minimist')(process.argv.slice(2), {
  alias: { d: 'data', o: 'out', z: 'zoom' },
  default: { z: '15', o: 'tiles/' }
});

//console.log(argv);

var input = argv.d;
var output = argv.o;
var zoom = argv.z;


if (!input) {
  console.log('Need to specify path to data; aborting.');
  console.log('Try running: node tile.js --data=path/to/data.js');
  return;
}
var orig = JSON.parse(fs.readFileSync(input));


// Create output directory
if (!fs.existsSync(output)){
  fs.mkdirSync(output);
}
console.log('Writing files to ' + output);

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
var tileindex = geojsonVt(orig, tileOptions);

var start_zoom = 0;
var end_zoom = zoom;
var start_x, end_x, start_y, end_y;
var tile_count = 0;
var merc = new SphericalMercator({ size: 256 }); // for mercator math
var bounds = geojsonExtent(orig); // latlng bounds of geometry

for (var z = start_zoom; z <= end_zoom; z++) {
  // Get tile bounds of geometry at current zoom
  var tile_bounds = merc.xyz(bounds, z);
  var candidate_count = (tile_bounds.maxX - tile_bounds.minX + 1) * (tile_bounds.maxY - tile_bounds.minY + 1);
  var tile_zoom_count = 0;
  console.log('Zoom ' + z + ', ' + candidate_count + ' candidate tiles');

  // Create 'z' directory
  if (!fs.existsSync(output + '/' + z + '/')){
      fs.mkdirSync(output + '/' + z + '/');
  }

  // Scan tile rows/columns
  start_x = tile_bounds.minX;
  start_y = tile_bounds.minY;
  end_x = tile_bounds.maxX;
  end_y = tile_bounds.maxY;

  for (var x = start_x; x <= end_x; x++) {
    var path = output + '/' + z + '/' + x;

    for (var y = start_y; y <= end_y; y++) {
      var tile = tileindex.getTile(z, x, y);
      if (!tile) {
        // console.log('NO TILE AT: ' + z + ', ' + x + ', ' + y + ' (skipping)');
        continue;
      }

      var buff = vtpbf.fromGeojsonVt({ 'geojsonLayer': tile });
      if (!buff) {
        console.error('ERROR CREATING BUFF AT ' + z + ', ' + x + ', ' + y);
        continue;
      }

      // Create 'x' directory
      if (!fs.existsSync(path)){
          fs.mkdirSync(path);
      }

      fs.writeFileSync(path + '/' + y + '.mvt', buff);
      tile_zoom_count++;
    }
  }

  tile_count += tile_zoom_count;
  console.log('Finished zoom ' + z + ', ' + tile_zoom_count + ' tiles generated');
}

console.log('-----\nTotal tiles generated:', tile_count);
