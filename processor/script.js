var uglify = require('uglifyjs').minify;
var config = require('../config');

exports.extnames = [
    '.js'
];

exports.is = function (node) {
    return exports.extnames.indexOf(node.extname) >= 0;
};

exports.build = function (node) {
    if (config.release) {
        node.content = exports.uglify(node.content.toString());
    }
};

exports.uglify = function (code) {
    var result = uglify(code, {
        fromString: true,
        compress: {
            warnings: false,
            // see https://github.com/ecomfe/edp/issues/230
            conditionals: false
        },
        mangle: {
            except: ['require', 'exports', 'module']
        }
    });
    return result.code;
};