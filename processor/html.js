var readRequireConfig = require('amd-deploy/lib/readRequireConfig');
var config = require('../config');
var smarty = require('./smarty');

var extname = {
    '.html': 1,
    '.tpl': 1
};

exports.is = function (node) {
    if (extname[node.extname]) {
        return !smarty.is(node);
    }
};

exports.build = function (node) {

};


exports.updateAmdConfg = function (content) {

    var list = readRequireConfig(content);

    if (Array.isArray(list) && list.length > 0) {

        var parts = [ ];
        var fromIndex = 0;

        list.forEach(function (item, index) {

            parts.push(
                content.substring(fromIndex, item.fromIndex)
            );

            var code;

            if (item.data) {
                code = JSON.stringify(
                    config.getOutputAmdConfig(item.data),
                    null,
                    item.indentBase
                );
            }
            else {
                code = content.substring(
                    item.fromIndex,
                    item.toIndex
                );
            }

            parts.push(code);

            fromIndex = item.toIndex;

        });

        parts.push(
            content.substring(fromIndex)
        );

        return parts.join('');

    }

    return content;

};
