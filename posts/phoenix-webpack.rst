---
date: 2017-06-18 23:40
tags:
  - phoenix
  - elixir
  - webpack
  - javascript
  - programming
description: Phoenixのフロントンドをwebpackにします
title: Phoenixのフロントエンドをwebpackに置き換える
slug: phoenx-webpack
---

Phoenixのフロントエンドをwebpackに置き換える
###################################################

Phoenixのフロントエンドのツールをwebpackにするのに思いの外手こずったので備忘録としておきます。

============================================
前提事項
============================================

- ``mix phoenix.new hogehoge`` はしてある前提です。
- 参考にしたのは以下あたりです。勝手に感謝です。

  - https://daruiapprentice.blogspot.jp/2016/04/using-webpack-with-phoenix-framework.html
  - https://www.dailydrip.com/topics/elixirsips/drips/webpack-phoenix-and-elm

============================================
要らないファイルの削除
============================================

``brunch-config.js`` を削除します。大概忘れるので早めにやっておきます。

============================================
package.jsonの作成
============================================

``package.json`` を書き換えます。

また、 ``TypeScript`` と ``React.js`` で試したので以下のような感じになりました。
``dependencies`` とかは各自 ``npm install --save hoge`` とか ``npm install --save-dev hoge`` とかしてもらえればいいと思います。

また、コマンドで ``watch`` と ``compile`` だけ指定してあります。


.. code-block:: JavaScript

   {
     "repository": {},
     "license": "MIT",
     "scripts": {
       "watch": "webpack --watch-stdin --progress --color",
       "compile": "webpack -p"
     },
     "dependencies": {
       "flux": "^3.1.2",
       "react": "^15.5.4",
       "react-dom": "^15.5.4",
       "redux": "^3.6.0",
       "typescript": "^2.3.4",
       "phoenix": "file:deps/phoenix",
       "phoenix_html": "file:deps/phoenix_html"
     },
     "devDependencies": {
       "@types/flux": "^3.1.0",
       "@types/material-ui": "^0.17.10",
       "@types/phoenix": "0.0.4",
       "@types/react": "^15.0.27",
       "@types/react-dom": "^15.5.0",
       "awesome-typescript-loader": "^3.1.3",
       "bootstrap-sass": "^3.3.7",
       "copy-webpack-plugin": "^4.0.1",
       "css-loader": "^0.28.4",
       "extract-text-webpack-plugin": "^2.1.2",
       "file-loader": "^0.11.2",
       "node-sass": "^4.5.3",
       "sass-loader": "^6.0.6",
       "source-map-loader": "^0.2.1",
       "style-loader": "^0.18.2",
       "url-loader": "^0.5.9",
       "webpack": "^2.6.1"
     }
   }

``phoenix_html`` とかのインストールがたまにおかしくなるので、以下を参照にアップデートをかけます。

https://github.com/phoenixframework/phoenix/issues/1622

============================================
webpack.config.jsonの作成
============================================

webpackの設定ファイルを以下のような感じで作ります。
webpackのバージョンの差異かなんかで前まで ``url`` だとか ``file`` だとかで指定されていた部分を
``url-loader`` などの形式にしてます。

また、 ``ExtractTextPlugin.extract`` の部分も参考サイトをそのままやると怒られるので怒られた内容通りに変更します。

それ以外だと ``TypeScript`` ゆえにそれに準じているという程度かと。

.. code-block:: JavaScript

   var ExtractTextPlugin = require("extract-text-webpack-plugin");
   var CopyWebpackPlugin = require("copy-webpack-plugin");
 
   module.exports = {
     entry: ["./web/static/js/App.tsx", "./web/static/css/app.scss"],
     output: {
       filename: "js/app.js",
       path: __dirname + "/priv/static/"
     },
 
     devtool: "source-map",
 
     resolve: {
       extensions: [".ts", ".tsx", ".js", ".json"],
       modules: [
         __dirname + "/web/static/js",
         __dirname + "/node_modules"
       ],
       alias: {
         phoenix_html: __dirname + "/deps/phoenix_html/web/static/js/phoenix_html.js",
         phoenix: __dirname + "/deps/phoenix/web/static/js/phoenix.js"
       }
     },
 
     module: {
       rules: [
         { test: /\.tsx?$/, loader: "awesome-typescript-loader" },
         { enforce: "pre", test: /\.js$/, loader: "source-map-loader" },
         {
           test: /\.(woff|woff2)(\?v=\d+\.\d+\.\d+)?$/,
           loader: "url-loader?limit=10000&mimetype=application/font-woff"
         },
         {
           test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/,
           loader: "url-loader?limit=10000&mimetype=application/octet-stream"
         },
         {
           test: /\.eot(\?v=\d+\.\d+\.\d+)?$/,
           loader: "file-loader"
         },
         {
           test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
           loader: "url-loader?limit=10000&mimetype=image/svg+xml"
         },
         {
           test: /\.scss$/,
           use: ExtractTextPlugin.extract({ fallback: "style-loader", use: ["css-loader", "sass-loader"] })
         },
         { test: /\.css$/, loader: ExtractTextPlugin.extract({ fallback: 'style-loader', use: 'css-loader' }) },
       ]
     },
     plugins: [
       new ExtractTextPlugin("css/app.css"),
       new CopyWebpackPlugin([{ from: "./web/static/assets" }])
     ]
   };

ざっとは理解してるはずですが、細かいところまでは理解しきれてません・・・

============================================
Phoenixの設定ファイル変更
============================================

``phoenix`` 側で ``brunch`` 前提の設定になっていたところを変えます。

``config/dev.exs`` です。

.. code-block:: elixir

   use Mix.Config
 
   # For development, we disable any cache and enable
   # debugging and code reloading.
   #
   # The watchers configuration can be used to run external
   # watchers to your application. For example, we use it
   # with brunch.io to recompile .js and .css sources.
   config :test, Test.Endpoint,
     http: [port: 4000],
     debug_errors: true,
     code_reloader: true,
     check_origin: false,
     watchers: [node: ["node_modules/webpack/bin/webpack.js",
                      "--watch-stdin", "--progress", "--colors"]]
   …


============================================
cssの変更
============================================

さらに、このままだと ``css`` 周りが色々とうまくいかないです。

まず ``app.css`` を ``app.scss`` に変更し、以下のような感じにします。

.. code-block:: css

   $icon-font-path: '~bootstrap-sass/assets/fonts/bootstrap/';
   @import "~bootstrap-sass/assets/stylesheets/_bootstrap.scss";
 
   /* Space out content a bit */
 
   body,
   form,
   ul,
   table {
     margin-top: 20px;
     margin-bottom: 20px;
   }
 
 
   /* Phoenix flash messages */
 
   .alert:empty {
     display: none;
   }
 
 
   /* Phoenix inline forms in links and buttons */
 
   form.link,
   form.button {
     display: inline;
   }
 
 
   /* Custom page header */
 
   .header {
     border-bottom: 1px solid #e5e5e5;
   }
 
   .logo {
     width: 519px;
     height: 71px;
     display: inline-block;
     margin-bottom: 1em;
     background-image: url("/images/phoenix.png");
     background-size: 519px 71px;
   }
 
 
   /* Everything but the jumbotron gets side spacing for mobile first views */
 
   .header,
   .marketing {
     padding-right: 15px;
     padding-left: 15px;
   }
 
 
   /* Customize container */
 
   @media (min-width: 768px) {
     .container {
       max-width: 730px;
     }
   }
 
   .container-narrow>hr {
     margin: 30px 0;
   }
 
 
   /* Main marketing message */
 
   .jumbotron {
     text-align: center;
     border-bottom: 1px solid #e5e5e5;
   }
 
 
   /* Supporting marketing content */
 
   .marketing {
     margin: 35px 0;
   }
 
 
   /* Responsive: Portrait tablets and up */
 
   @media screen and (min-width: 768px) {
     /* Remove the padding we set earlier */
     .header,
     .marketing {
       padding-right: 0;
       padding-left: 0;
     }
     /* Space out the masthead */
     .header {
       margin-bottom: 30px;
     }
     /* Remove the bottom border on the jumbotron for visual effect */
     .jumbotron {
       border-bottom: 0;
     }

``import`` 部分以降が何かというと ``phoenix.css`` にかかれていたやつです。

組み込みの ``phoenix.css`` を眺めた感じ、ここに ``bootstrap`` の内容+αが書かれていたようでした。
``bootstrap`` は外部から持ってくるようにしたので不要です。

従って+α部分をこっちに持ってきた形です。

============================================
実行
============================================

``npm run compile`` もしくは ``Phoenix`` を起動し、ファイル監視が始まればOKです。

``TypeScript`` 周りは簡単でしたが、 ``css`` 周りが大変でした・・・

適当に書いたので間違っているところも多そうですが、単なる備忘録なのでこのへんで終わりです。
