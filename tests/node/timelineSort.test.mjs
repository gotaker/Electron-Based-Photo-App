import { test } from 'node:test';
import assert from 'node:assert';

function sortPhotosForTimeline(list) {
    return [...list].sort((a, b) => {
        const d1 = new Date(a.captureDateISO || a.dateAdded || 0).getTime();
        const d2 = new Date(b.captureDateISO || b.dateAdded || 0).getTime();
        return d2 - d1;
    });
}

test('timeline sort: newest first', () => {
    const list = [
        { id: '1', captureDateISO: '2020-01-01T00:00:00.000Z' },
        { id: '2', captureDateISO: '2024-06-15T12:00:00.000Z' }
    ];
    const sorted = sortPhotosForTimeline(list);
    assert.strictEqual(sorted[0].id, '2');
});
