---
title: blogをdeno製静的サイトジェネレーターlumeに移植した
description: pelicanからlumeに移植したので紹介です
date: 2022-10-21 00:12
tags: 
  - programming
  - deno
category: programming
---

blogをdeno製静的サイトジェネレーターlumeに移植した
################################

何年ぶりだって感じですが、久々のブログです。
色々あって(転職したり、病気したり)、なかなかブログ書くって感じでもなかったですが、思い切ってツールごと切り替えたので紹介です。

============================================
deno製静的サイトジェネレーター「lume」
============================================

`https://lume.land/ <https://lume.land/>`_

JavaScript/TypeScriptのランタイムであるdenoでできている静的サイトジェネレーターです。

- 自分でレンダリングやファイルローダーカスタマイズできるPlugin機構がある

  - 公式のPluginも初めから結構ある
  - 検索やタグ機能もプラグインで提供されている(デフォルトインストール済み)

- テンプレートもいくつか対応されている

  - Markdown、Nunjucks、Pug、JSXなど

- denoなのでカスタムプラグインや設定などをTypeScriptで書ける


============================================
既存のブログ記事をlumeに移植する
============================================

このブログのマークアップ言語はrestructuredTextで書かれています。拡張子はrstです。
色々プラグインありますが、rstファイルに対応しているものはないので自分でなんとかしないといけないです。

今回は以下の方法で対応しました。

- rstのパーサー、レンダラーはRust製のものがあったのでWebAssemblyにしてdenoから扱う
- 上記で作ったものはカスタムプラグインを作ってrstファイルの場合はそちらでレンダリングを行う

denoがWeb標準のAPIに準拠しているおかげで、WebAssemblyさえ作れれば割りと拡張性が高いですね。

============================================
RustでrstをレンダリングするWebAssemblyを作る
============================================

WebAssemblyのツールチェインとしては、denoのブログで紹介されている以下を使います。

`https://deno.com/blog/wasmbuild <https://deno.com/blog/wasmbuild>`_

内部的にはwasm_bindgenというRustのツールチェインが使われています。rstのレンダリングに使っているcrate(Rustのライブラリ)は以下です。

`https://github.com/flying-sheep/rust-rst <https://github.com/flying-sheep/rust-rst>`_

.. code-block:: Rust

   use rst_parser::parse;
   use rst_renderer::render_html;
   use std::str;
   use wasm_bindgen::prelude::*;
   
   #[wasm_bindgen]
   pub fn render_rst(rst: &str, is_standalone: bool) -> Result<String, JsError> {
     let content = rst.replace('\t', " ".repeat(8).as_ref());
     let document = match parse(&content) {
       Ok(doc) => doc,
       Err(e) => return Err(JsError::new(e.to_string().as_ref())),
     };
   
     let mut s = Vec::new();
     match render_html(&document, &mut s, is_standalone) {
       Ok(_) => (),
       Err(e) => return Err(JsError::new(e.to_string().as_ref())),
     }
     return Ok(str::from_utf8(&s)?.to_string());
   }
   
   #[cfg(test)]
   mod tests {
     const TEST_DOC2: &str = "Programming Phoenix勉強その2
   ################################
   
   :date: 2016-12-31 00:50
   :tags: Elixir,Phoenix
   :slug: programming-phoenix2
   :related_posts: programming-phoenix1
   :summary: Programming Phoenixって本を読むその2
   
   | その2です。
   | その1の続きです。
   
   =========================================
   デフォルトのディレクトリ構成について
   =========================================
   
   - ``config`` ディレクトリ
   
     - Phoenixの設定ファイル置き場.名前のまま.
     - ``prod.secret.exs`` は秘密情報が入っているファイルなので,VCSからは外すこと.
     - ``config.exs`` の ``endpoint`` はWebサーバーとアプリケーションの接続の境界部分.
   
   - ``lib`` ディレクトリ
   
     - Supervision treeと,長く起動するプロセスが置かれる.（?,あってるか微妙）
     - DBとのコネクションプールとかのような長く使われるものが置かれるっぽい.
   
   - ``test`` ディレクトリ
   
     - 名前の通りテストが置かれる.
   
   - ``web`` ディレクトリ
   
     - Webアプリに必要な ``model``, ``view``, ``template``, ``controller`` が置かれる.
   
   ==============
   Plugについて
   ==============
   
   | ``Plug`` ライブラリは接続の統一化のために使われる.
   | ``Plug`` のリポジトリ `Plugリポジトリ`_ には以下のように書いてある.
   
   ::
   
       ・ A specification for composable modules between web applications
       ・ Connection adapters for different web servers in the Erlang VM
   
   | なので,各機能のモジュールの仕様の記述と,Erlang VMと各Webサーバーとの接続をやってくれるみたいです.
   | （あまり理解してない感が）
   | 実際にPhoenixが作ってくれる物を見てみます. ``config/endpoint.exs`` を見てみます.
   
   .. code-block:: Elixir
       :linenos:
   
       defmodule Hello.Endpoint do
         use Phoenix.Endpoint, otp_app: :hello
   
         socket \"/socket\", Hello.UserSocket
   
         # Serve at \"/\" the static files from \"priv/static\" directory.
         #
         # You should set gzip to true if you are running phoenix.digest
         # when deploying your static files in production.
         plug Plug.Static,
           at: \"/\", from: :hello, gzip: false,
           only: ~w(css fonts images js favicon.ico robots.txt)
   
         # Code reloading can be explicitly enabled under the
         # :code_reloader configuration of your endpoint.
         if code_reloading? do
           socket \"/phoenix/live_reload/socket\", Phoenix.LiveReloader.Socket
           plug Phoenix.LiveReloader
           plug Phoenix.CodeReloader
         end
   
         plug Plug.RequestId
         plug Plug.Logger
   
         plug Plug.Parsers,
           parsers: [:urlencoded, :multipart, :json],
           pass: [\"*/*\"],
           json_decoder: Poison
   
         plug Plug.MethodOverride
         plug Plug.Head
   
         # The session will be stored in the cookie and signed,
         # this means its contents can be read but not tampered with.
         # Set :encryption_salt if you would also like to encrypt it.
         plug Plug.Session,
           store: :cookie,
           key: \"_hello_key\",
           signing_salt: \"zzWE+Yw+\"
   
         plug Hello.Router
       end
   
   | とりあえず ``plug`` ってのがいっぱい出てきています.
   | なんとなく見てると, ``plug Plug.Static`` で静的ファイルについての設定っぽいものが書いてあったり,
   | ``plug Plug.Logger`` とか, ``plug Plug.Parsers`` とかあったりして,Webアプリに必要な設定が書いてあるっぽいなと言う感覚です.
   | ココらへんの一連の ``plug`` は関数のパイプラインとして処理されるようです.
   |
   
   .. code-block:: Elixir
       :linenos:
   
       connection
       |> Plug.Static.call 
       |> Plug.RequestId.call  
       |> Plug.Logger.call 
       |> Plug.Parsers.call  
       |> Plug.MethodOverride.call
       |> Plug.Head.call  
       |> Plug.Session.call
       |> Hello.Router.call
   
   | ソースに書いた順になってるっぽいです.Servletの設定順ミスってハマった思い出が…
   | ちなみに ``endpoint`` 自体も ``plug`` で,アプリケーション自体は ``endpoint`` で始まり ``controller`` で終わる一連のパイプラインらしい.
   
   ================
   Routerについて
   ================
   
   | ``web/router.ex`` のソースを見ると,2つのパイプラインがあることがわかる.
   
   .. code-block:: Elixir
       :linenos:
   
       defmodule Hello.Router do
         use Hello.Web, :router
   
         pipeline :browser do
           plug :accepts, [\"html\"]
           plug :fetch_session
           plug :fetch_flash
           plug :protect_from_forgery
           plug :put_secure_browser_headers
         end
   
         pipeline :api do
           plug :accepts, [\"json\"]
         end
   
         scope \"/\", Hello do
           pipe_through :browser # Use the default browser stack
   
           get \"/hello/:name\", HelloController, :world
           get \"/\", PageController, :index
         end
   
         # Other scopes may use custom stacks.
         # scope \"/api\", Hello do
         #   pipe_through :api
         # end
       end
   
   
   - ``browser`` パイプライン
   
     - HTMLのみを受け付ける.
     - セッション管理とか,フラッシュメッセージとか,セキュリティ対策とかを提供してくれるらしい.
   
   - ``api`` パイプライン
   
     - 基本的なJSON API用のパイプライン.JSONのみ受け付ける.
     - XMLにしたいときとかはここ一箇所変更すれば全部変更される.
   
   | ``pipe_through`` でどのパイプラインを使うか書く.
   | 処理の流れとしては接続を取得→パイプラインを呼び出し→コントローラーを呼び出し.
   | 呼び出し順を纏めると以下になる.
   
   .. code-block:: Elixir
       :linenos:
   
       connection
       |> endpoint
       |> router 
       |> pipeline  
       |> controller
   
   ==================
   まとめ
   ==================
   
   | 今回は,内部的な処理の流れとかおまじない的な部分が何をしてるかの勉強だった感じです.
   | 英語がヘタレ過ぎて自分が理解している意味とあってるか若干の不安が...
   
   リンク
   =============
   
   .. Plugリポジトリ link: https://github.com/elixir-lang/plug
   ";
   
     const TEST_DOC: &str = "About me
   =================
   
   
   - 名前
   
     - y-fujiwara
     - nuhera or zonuko (HN)
   
   - 経歴
   
     - 千葉県の私立理系大学院修了(2015/3)
   
       - 数理計画の類をやってた。
       - Pythonつかって色々やってた。
   
     - 都内のIT企業に就職(2015/4 ～ 今まで)
   
       - メインはC++かC#かJava
       - たまにRubyとかJavaScript
   
   Interests
   =============
   
   - アニメ
   
     - SHOW BY ROCK!!
   
       - 2期円盤マラソン中
   
   - Game
   
     - STG どれも下手くそ
   
       - レイストーム
       - ダライアス外伝
   
     - 格闘ゲーム
   
       - コンボゲーと呼ばれる物
   
   - Music
   
     - ゲームサントラ集め
   
   - Technology
   
     - 業務でつかった物
     - Vim
   
       - 修行中
   
     - Python
     - Elixir
     - Haskell,Rust
   
       - 勉強中・・・
   
     - Elm
     - 線形代数
     - プログラミング言語作成
   
       - 将来的に・・・
   
   .. image:: /images/DSC_8445.JPG
     :alt: Quicksilver
   ";
   
     use super::*;
   
     #[test]
     fn rst_to_html() {
       match render_rst(TEST_DOC, false) {
         Ok(_) => (),
         Err(e) => panic!("{:?}", JsValue::from(e).as_string().unwrap()),
       }
       assert!(true);
     }
   
     #[test]
     fn rst_to_html2() {
       match render_rst(TEST_DOC2, false) {
         Ok(_) => (),
         Err(e) => panic!("{:?}", JsValue::from(e).as_string().unwrap()),
       }
       assert!(true);
     }
   }

テスト雑ですが、パーサーとかのエラーで落ちないかどうかだけが気になるのでエラーの場合はあえてpanicしてます。最初にビルドしたときにエラーになったシンタックスがいくつかあったのでそこらへんだけ担保したい感じです。

deno側は単に即exportして終わりです。deno用にビルドされているだけで、非同期で読み込む必要があるなど、wasmの取り扱い方的には普通にwasm_bindgen使うときとそう変わらないです。

.. code-block:: TypeScript

   export { instantiate } from "./lib/rs_lib.generated.js";

============================================
作ったライブラリをlumeのPluginにする
============================================

コード見てもらったほうが早いと思います。プラグインの作り方はlumeの公式サイトにあります。

.. code-block:: TypeScript

   import type { Data, DeepPartial, Engine, Helper, Site } from "lume/core.ts";
   import { merge } from "lume/core/utils.ts";
   import loader from "lume/core/loaders/text.ts";
   import { instantiate } from "./rst_render/lib.ts";
   
   export interface Options {
     /** The list of extensions this plugin applies to */
     extensions: string[];
   
     /** To modify existing rules or new custom rules */
     // deno-lint-ignore no-explicit-any
     rules: Record<string, (...args: any[]) => any>;
   
     /** Set `true` append your plugins to the defaults */
     keepDefaultPlugins: boolean;
   }
   
   // Default options
   export const defaults: Options = {
     extensions: [".rst"],
     rules: {},
     keepDefaultPlugins: false,
   };
   
   /** Template engine to render Markdown files */
   export class RstEngine implements Engine {
     #instance:
       | { render_rst: (rst: string, is_standalone: boolean) => string }
       | null;
     constructor() {
       this.#instance = null;
     }
   
     async init() {
       this.#instance = await instantiate();
     }
   
     deleteCache() {}
   
     render(
       content: string,
       _data?: Data,
       _filename?: string,
     ): string {
       if (!this.#instance) {
         throw new Error("engine is not inited.");
       }
       return this.#instance.render_rst(content, true);
     }
   
     renderInline(content: string): string {
       if (!this.#instance) {
         throw new Error("engine is not inited.");
       }
   
       return this.#instance.render_rst(content, false);
     }
   
     renderSync(
       content: unknown,
       _data?: Data,
       _filename?: string,
     ): string {
       if (!this.#instance) {
         throw new Error("engine is not inited.");
       }
   
       if (typeof content !== "string") {
         content = String(content);
       }
       return this.#instance.render_rst(content as string, true);
     }
   
     addHelper() {}
   }
   
   export default function (userOptions?: DeepPartial<Options>) {
     const options = merge(defaults, userOptions);
   
     return async function (site: Site) {
       const engine = new RstEngine();
       await engine.init();
       // pugやnunjucksを使ってテンプレート上にhtmlをレンダリングする場合はエンジンの登録が必須なのでやっておく
       site.loadPages(options.extensions, loader, engine);
   
       function filter(string: string, inline = false): string {
         if (inline) {
           return engine.renderInline(string?.toString() || "").trim();
         }
         return engine.render(string?.toString() || "").trim();
       }
   
       // Register the md filter
       site.filter("rst", filter as Helper, true);
     };
   }


ポイントは以下です。

- デフォルトエクスポートされる関数を一つ用意する

  - 引数はプラグインオプション

- 上記関数はSiteオブジェクトを引数に取る関数をreturnする
- returnする関数の中でSiteオブジェクトに加工することでレンダリング等を制御できる

ちょいと微妙なのが最終的な関数がasyncな点です。戻り値が必要な関数ではないので、おそらく大丈夫とは思います。

============================================
課題
============================================

すべてのrestructuredTextのシンタックスに対応しているわけではないです。
番号付きリスト等に対応されていません。

`https://github.com/flying-sheep/rust-rst/blob/c2eace26cd421ab773f325264eaae0c4e15e932c/parser/src/rst.pest#L344 <https://github.com/flying-sheep/rust-rst/blob/c2eace26cd421ab773f325264eaae0c4e15e932c/parser/src/rst.pest#L344>`_ 等を見ると、コメントされていてまだ未対応なことがわかります。

- 自分でforkして改造する
- 自分でパーサーとか作る
- Pythonとかを無理やり読み込む(Sphinx直接使うので対応漏れとかがなさそう)

等が考えられますが、今のところ対応してないものに気をつければ読めるものはできるので追々...ということで。

============================================
まとめ
============================================

地味にブログのビルドとかもGitHub Actionsにしたりして書きやすくなったのでちょいちょい復活していきたいです。

とはいえ会社でもブログ書いてるので分配に迷います...
