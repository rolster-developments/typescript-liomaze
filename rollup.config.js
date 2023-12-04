import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

const plugins = [
  commonjs(),
  resolve(),
  typescript({
    tsconfig: './tsconfig.app.json',
    declaration: true,
    declarationDir: 'dist',
    include: ['node_modules/@rolster/types/index.d.ts']
  })
];

const rollupTs = (name) => {
  return {
    input: `dist/esm/${name}.js`,
    output: [
      {
        file: `dist/cjs/${name}.js`,
        format: 'cjs',
        sourcemap: true,
        inlineDynamicImports: true
      },
      {
        file: `dist/es/${name}.js`,
        format: 'es',
        sourcemap: true,
        inlineDynamicImports: true
      }
    ],
    external: ['@rolster/helpers-advanced'],
    plugins
  };
};

export default [rollupTs('index')];
