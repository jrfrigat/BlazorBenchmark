// Audit only resources already loaded, after interaction measurements.
(function () {
    'use strict';
    async function verify(manifest, names, origin, fetchResource = fetch, digest = crypto.subtle) {
        const assets = new Map(manifest.assets.map(a => ['/' + a.Path, a.Sha256.toLowerCase()]));
        const checked = [], errors = [];
        const urls = [...new Set(names)].map(name => new URL(name, origin))
            .filter(url => /\.(js|css)$/i.test(url.pathname) && !url.pathname.startsWith('/__'));
        const paths = new Set();
        for (const url of urls) {
            if (url.origin !== origin) { errors.push('external resource: ' + url.href); continue; }
            if (paths.has(url.pathname)) continue;
            paths.add(url.pathname);
            const expected = assets.get(decodeURIComponent(url.pathname));
            if (!expected) { errors.push('unlisted resource: ' + url.pathname); continue; }
            try {
                // Default cache mode preserves the body cached by the original load.
                const response = await fetchResource(url.href, {cache:'default'});
                if (!response.ok) throw new Error('HTTP ' + response.status);
                const hash = await digest.digest('SHA-256', await response.arrayBuffer());
                const actual = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
                checked.push({path:decodeURIComponent(url.pathname), expected, actual});
                if (actual !== expected) errors.push('hash mismatch: ' + url.pathname);
            } catch(error) { errors.push(url.pathname + ': ' + error); }
        }
        if (!checked.length) errors.push('no loaded JS/CSS checked');
        return {publicationId:manifest.publicationId, checked, errors, success:errors.length === 0};
    }
    async function audit() {
        // Capture inventory before control requests. Never import or fetch unused modules.
        const names = performance.getEntriesByType('resource').map(e => e.name);
        for (const element of document.querySelectorAll('script[src],link[rel="stylesheet"][href]'))
            names.push(element.src || element.href);
        const response = await fetch('/__manifest', {cache:'no-store'});
        if (!response.ok) throw new Error('resource manifest unavailable');
        return verify(await response.json(), names, location.origin);
    }
    window.benchIntegrity = {verify, audit};
})();
