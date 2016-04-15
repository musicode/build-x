var feTreeUtil = require('fe-tree/lib/util');

var config = require('../config');
var html = require('./html');

var extname = {
    '.html': 1,
    '.phtml': 1,
};

exports.is = function (node) {
    if (extname[node.extname]) {
        return node.file.startsWith(config.viewDir);
    }
};

exports.build = function (node) {

    var content = node.content.toString();

    var newContent = feTreeUtil.replace(
        content,
        /{edp-variable:{version}}/g,
        Date.now()
    );

    newContent = feTreeUtil.replace(
        newContent,
        /\$custom_path\s*=\s*['"]([^'"]+)['"]/g,
        function ($0, $1) {
            return $1
                ? feTreeUtil.replace($0, $1, config.getOutputFile($1))
                : $0;
        }
    );

    newContent = html.updateAmdConfg(newContent);

    if (content !== newContent) {
        node.content = newContent;
    }
};

