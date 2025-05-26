import * as path from 'path';

export default {
    entry: {
        background: './background.js',
        generate: './generation.js',
        database: './database.js',
    },
    output: {
        path: path.resolve(process.cwd(), 'dist'),
        filename: '[name].bundle.js',
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    },
    resolve: {
        fallback: {
            "fs": false,
            "path": false,
            "os": false
        }
    }
};