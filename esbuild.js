const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',
    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });
            console.log('[watch] build finished');
        });
    },
};

async function main() {
    const ctxClient = await esbuild.context({
        entryPoints: ['src/client/client.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        target: 'node16',
        outfile: 'dist/client.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
    });

    const ctxServer = await esbuild.context({
        entryPoints: ['src/server/server.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        target: 'node16',
        outfile: 'dist/server.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
    });

    if (watch) {
        await ctxClient.watch();
        await ctxServer.watch();
    } else {
        await ctxClient.rebuild();
        await ctxServer.rebuild();
        await ctxClient.dispose();
        await ctxServer.dispose();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
