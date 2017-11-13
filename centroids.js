// Takes an array of GeoJSON features, returns an array of centroids for all polygons/multipolygons
function getCentroidFeatures (geojson) {
  var features = geojson.features;
  var centroids = [];

  for (var f=0; f < features.length; f++) {
    var feature = features[f];

    if (feature.geometry == null) {
      continue; // no geometry (which is valid GeoJSON)
    }

    switch (feature.geometry.type) {
      case 'Polygon':
        features.push(getCentroidFeatureForPolygon(feature.geometry.coordinates, feature.properties));
        break;
      case 'MultiPolygon':
        // Add centroid feature for each polygon
        feature.geometry.coordinates.forEach(function(coordinates) {
          features.push(getCentroidFeatureForPolygon(coordinates, feature.properties));
        });
        break;
    }
  }

  features = features.filter(function(x){ return x }); // remove null features
  return {
    type: 'FeatureCollection',
    features: features
  };
}

// Create a point feature for the cenrtoid of a polygon
function getCentroidFeatureForPolygon (coordinates, properties) {
  var centroid = getCentroid(coordinates);
  if (!centroid) {
    return;
  }

  return {
    type: 'Feature',
    properties: properties,
    geometry: {
      type: 'Point',
      coordinates: centroid
    }
  };
}

// Geometric / weighted centroid of polygon
// Adapted from https://github.com/Leaflet/Leaflet/blob/c10f405a112142b19785967ce0e142132a6095ad/src/layer/vector/Polygon.js#L57
function getCentroid (polygon) {
  if (!polygon || polygon.length === 0) {
    return;
  }

  var x = 0, y = 0, area = 0;
  var ring = polygon[0]; // only use first ring for now
  var len = ring.length;

  // calculate relative to first coordinate to avoid precision issues w/small polygons
  var origin = ring[0];
  ring = ring.map(function(v){ return [v[0] - origin[0], v[1] - origin[1]] });

  for (var i = 0, j = len - 1; i < len; j = i, i++) {
    var p0 = ring[i];
    var p1 = ring[j];
    var f = p0[1] * p1[0] - p1[1] * p0[0];

    x += (p0[0] + p1[0]) * f;
    y += (p0[1] + p1[1]) * f;
    area += f * 3;
  }

  var c = [x / area, y / area];
  c[0] += origin[0];
  c[1] += origin[1];
  return c;
}

module.exports = getCentroidFeatures;
