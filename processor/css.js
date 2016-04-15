
var minify = require('css-minifiers')['clean-css'];
var autoprefixer = require('autoprefixer');
var postcss = require('postcss');

var config = require('../config');

var extname = {
    '.css': 1
};

exports.is = function (node) {
    return extname[node.extname];
};

exports.build = function (node) {
    return new Promise(function (resolve, reject) {
        exports.autoprefixer(
            node.content.toString()
        )
        .then(function (css) {
            if (config.release) {
                minify(css)
                .then(
                    function (output) {
                        node.content = output;
                        resolve();
                    },
                    function (error) {
                        console.error(node.file, error);
                    }
                );
            }
            else {
                resolve();
            }
        });
    });
};

exports.autoprefixer = function (css) {

    var instance = autoprefixer({
        browsers: [
            '> 0%',
            'last 10 version'
        ]
    });

    return new Promise(function (resove) {
        postcss([ instance ]).process(css).then(
            function (result) {
                result.warnings().forEach(
                    function (warning) {
                        console.warn(warning.toString());
                    }
                );
                resove(result.css);
            }
        );
    });

};

