import * as path from 'path';
import fs from 'fs';

export default (env, _argv) => {
  const browser = env?.browser || 'chrome';

  return {
    entry: {
      background: './background.ts',
      popup: './popup.ts',
      options: './options.ts',
    },
    output: {
      path: path.resolve(process.cwd(), `dist-${browser}`),
      filename: '[name].bundle.js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-typescript'],
            },
          },
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      fallback: {
        fs: false,
        path: false,
        os: false,
      },
    },
    plugins: [
      // Copy necessary files for the extension
      {
        apply: compiler => {
          compiler.hooks.afterEmit.tap('CopyAssets', () => {
            const distDir = path.resolve(process.cwd(), `dist-${browser}`);

            // Copy manifest
            const manifestSrc = `manifest.${browser}.json`;
            const manifestDest = path.resolve(distDir, 'manifest.json');
            if (fs.existsSync(manifestSrc)) {
              fs.copyFileSync(manifestSrc, manifestDest);
            }

            // Copy popup.html
            const popupSrc = 'popup.html';
            const popupDest = path.resolve(distDir, 'popup.html');
            if (fs.existsSync(popupSrc)) {
              fs.copyFileSync(popupSrc, popupDest);
            }

            // Copy options.html
            const optionsSrc = 'options.html';
            const optionsDest = path.resolve(distDir, 'options.html');
            if (fs.existsSync(optionsSrc)) {
              fs.copyFileSync(optionsSrc, optionsDest);
            }

            // Copy config.json
            const configSrc = 'config.json';
            const configDest = path.resolve(distDir, 'config.json');
            if (fs.existsSync(configSrc)) {
              fs.copyFileSync(configSrc, configDest);
            }

            // Copy icons directory
            const iconsSrc = 'icons';
            const iconsDest = path.resolve(distDir, 'icons');
            if (fs.existsSync(iconsSrc)) {
              fs.cpSync(iconsSrc, iconsDest, { recursive: true });
            }
          });
        },
      },
    ],
  };
};
