const { escapeHtml, escapeJsString } = require('../../lib/stringUtils.cjs');

describe('stringUtils', () => {
    test('escapeHtml escapes HTML', () => {
        expect(escapeHtml('<a>')).toBe('&lt;a&gt;');
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    test('escapeJsString escapes quotes', () => {
        expect(escapeJsString("a'b")).toBe("a\\'b");
    });
});
