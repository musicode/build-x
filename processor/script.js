var uglify = require('uglify-js');
var babel = require('babel-core');

var config = require('../config');
var amd = require('./amd');

exports.extnames = [
    '.js'
];

exports.is = function (node) {
    if (exports.extnames.indexOf(node.extname) >= 0) {
        return !amd.is(node);
    }
};

exports.build = function (node) {
    var isNode = typeof node === 'object';
    var content = isNode ? node.content.toString() : node;
    if (config.babel) {
      content = babel.transform(content, { presets: ['env'] }).code;
    }
    var newContent = config.replaceContent(content, 'script');
    if (config.release) {
        newContent = exports.uglify(newContent);
    }
    if (isNode && content !== newContent) {
        node.content = newContent;
    }
    return newContent;
};

exports.uglify = function (code) {
    try {
        var result = uglify.minify(code, {
            compress: {
                warnings: false,
                // see https://github.com/ecomfe/edp/issues/230
                conditionals: false,
            },
            mangle: {
                reserved: ['require', 'exports', 'module']
            }
        });
        if (result.error) {
            console.error(result.error);
        }
        return result.code;
    }
    catch (e) {
        console.error(e);
        return code;
    }
};