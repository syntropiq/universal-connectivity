import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'

export default {
  input: 'src/lib/index.ts',
  output: [
    {
      dir: 'dist/lib',
      format: 'es',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src/lib',
      exports: 'named',
      entryFileNames: '[name].js'
    }
  ],
  plugins: [
    nodeResolve(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: './dist/lib'
    })
  ],
  external: [
    /^@chainsafe\//,
    /^@helia\//,
    /^@libp2p\//,
    /^@multiformats\//,
    'debug',
    'it-length-prefixed',
    'it-map',
    'it-pipe',
    'it-protobuf-stream',
    'libp2p',
    'protons-runtime',
    'uint8arrays'
  ]
}
