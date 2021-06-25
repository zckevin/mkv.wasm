const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: './index.js',
  output: {
    libraryTarget: 'umd',
    umdNamedDefine: true,

    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  module: {
    rules: [
      {
        test: /-worker\.js$/,
        use: [
          { loader: 'worker-loader' },
          { loader: 'babel-loader' }
        ],
      },
      {
        test: /\.js$/,
        loader: 'babel-loader',
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "public" },
      ],
    }),
  ],
};

