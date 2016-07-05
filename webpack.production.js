'use strict'

const common = require('./webpack.common')

const webpack = require('webpack')
const webpackTargetElectronRenderer = require('webpack-target-electron-renderer')
const ExtractTextPlugin = require('extract-text-webpack-plugin')

const config = {
  devtool: 'cheap-module-source-map',
  entry: common.entry,
  output: common.output,
  plugins: [
    ...common.plugins,
    new webpack.optimize.UglifyJsPlugin(),
    new webpack.optimize.OccurrenceOrderPlugin(true),
    new webpack.DefinePlugin({
      __DEV__: false
    })
  ],
  module: common.module,
  resolve: common.resolve,
  target: common.target,
  externals: common.externals,
  node: common.node
}

// This will cause the compiled CSS to be output to a
// styles.css and a <link rel="stylesheet"> tag to be
// appended to the index.html HEAD at compile time
config.module.loaders.push({
  test: /\.scss$/,
  loader:  ExtractTextPlugin.extract('style-loader', 'css-loader!sass-loader')
})

// Necessary to be able to use ExtractTextPlugin as a loader.
config.plugins.push(new ExtractTextPlugin('styles.css'))

config.target = webpackTargetElectronRenderer(config)

module.exports = config
