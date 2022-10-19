---
date: 2016-12-31 00:50
tags:
  - phoenix
  - elixir
  - programming
description: Programming Phoenixって本を読むその2
title: Programming Phoenix勉強その2
slug: programming-phoenix2
related_posts: programming-phoenix1
---

Programming Phoenix勉強その2
################################

その2です。
その1の続きです。

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

``Plug`` ライブラリは接続の統一化のために使われる.
``Plug`` のリポジトリ Plugリポジトリ_ には以下のように書いてある. 

::

   ・ A specification for composable modules between web applications
   ・ Connection adapters for different web servers in the Erlang VM

なので,各機能のモジュールの仕様の記述と,Erlang VMと各Webサーバーとの接続をやってくれるみたいです.
（あまり理解してない感が）
実際にPhoenixが作ってくれる物を見てみます. ``config/endpoint.exs`` を見てみます.


.. code-block:: Elixir

   defmodule Hello.Endpoint do
     use Phoenix.Endpoint, otp_app: :hello
 
     socket "/socket", Hello.UserSocket
 
     # Serve at "/" the static files from "priv/static" directory.
     #
     # You should set gzip to true if you are running phoenix.digest
     # when deploying your static files in production.
     plug Plug.Static,
       at: "/", from: :hello, gzip: false,
       only: ~w(css fonts images js favicon.ico robots.txt)
 
     # Code reloading can be explicitly enabled under the
     # :code_reloader configuration of your endpoint.
     if code_reloading? do
       socket "/phoenix/live_reload/socket", Phoenix.LiveReloader.Socket
       plug Phoenix.LiveReloader
       plug Phoenix.CodeReloader
     end
 
     plug Plug.RequestId
     plug Plug.Logger
 
     plug Plug.Parsers,
       parsers: [:urlencoded, :multipart, :json],
       pass: ["*/*"],
       json_decoder: Poison
 
     plug Plug.MethodOverride
     plug Plug.Head
 
     # The session will be stored in the cookie and signed,
     # this means its contents can be read but not tampered with.
     # Set :encryption_salt if you would also like to encrypt it.
     plug Plug.Session,
       store: :cookie,
       key: "_hello_key",
       signing_salt: "zzWE+Yw+"
 
     plug Hello.Router
   end

とりあえず ``plug`` ってのがいっぱい出てきています.
なんとなく見てると, ``plug Plug.Static`` で静的ファイルについての設定っぽいものが書いてあったり,
``plug Plug.Logger`` とか, ``plug Plug.Parsers`` とかあったりして,Webアプリに必要な設定が書いてあるっぽいなと言う感覚です.
ココらへんの一連の ``plug`` は関数のパイプラインとして処理されるようです.

.. code-block:: Elixir

   connection 
   |> Plug.Static.call
   |> Plug.RequestId.call
   |> Plug.Logger.call
   |> Plug.Parsers.call
   |> Plug.MethodOverride.call
   |> Plug.Head.call
   |> Plug.Session.call
   |> Hello.Router.call

ソースに書いた順になってるっぽいです.Servletの設定順ミスってハマった思い出が…
ちなみに ``endpoint`` 自体も ``plug`` で,アプリケーション自体は ``endpoint`` で始まり ``controller`` で終わる一連のパイプラインらしい.

================
Routerについて
================

``web/router.ex`` のソースを見ると,2つのパイプラインがあることがわかる.

.. code-block:: Elixir

   defmodule Hello.Router do
     use Hello.Web, :router
 
     pipeline :browser do
       plug :accepts, ["html"]
       plug :fetch_session
       plug :fetch_flash
       plug :protect_from_forgery
       plug :put_secure_browser_headers
     end
 
     pipeline :api do
       plug :accepts, ["json"]
     end
 
     scope "/", Hello do
       pipe_through :browser # Use the default browser stack
 
       get "/hello/:name", HelloController, :world
       get "/", PageController, :index
     end
 
     # Other scopes may use custom stacks.
     # scope "/api", Hello do
     #   pipe_through :api
     # end
   end


- ``browser`` パイプライン

  - HTMLのみを受け付ける.
  - セッション管理とか,フラッシュメッセージとか,セキュリティ対策とかを提供してくれるらしい.

- ``api`` パイプライン

  - 基本的なJSON API用のパイプライン.JSONのみ受け付ける.
  - XMLにしたいときとかはここ一箇所変更すれば全部変更される.

 ``pipe_through`` でどのパイプラインを使うか書く.
 処理の流れとしては接続を取得→パイプラインを呼び出し→コントローラーを呼び出し.
 呼び出し順を纏めると以下になる.

.. code-block:: Elixir

   connection
   |> endpoint
   |> router
   |> pipeline
   |> controller

==================
まとめ
==================

今回は,内部的な処理の流れとかおまじない的な部分が何をしてるかの勉強だった感じです.
英語がヘタレ過ぎて自分が理解している意味とあってるか若干の不安が...

.. _Plugリポジトリ: https://github.com/elixir-lang/plug
