---
date: 2017-02-17 00:12
tags:
  - phoenix
  - elixir
  - programming
description: Programming Phoenixって本を読むその20
title: Programming Phoenix勉強その20
slug: programming-phoenix20
related_posts: programming-phoenix19
---


Programming Phoenix勉強その20
################################

なんとその20です。 ``channel`` のテストの続きです。 ``wolfram`` のテストはしたので ``channel`` 周りのテストからです。

============================================
Channelの認証テスト
============================================

``wolfram`` のサービス用テストは作ったのでそれを呼び出す ``channel`` 側のテストを書きます。
まず認証をテストします。 ``rumbl/test/channel/user_socket_test.exs`` を実装します。


.. code-block:: Elixir

   defmodule Rumbl.Channels.UserSocketTest do 
     use Rumbl.ChannelCase, async: true 
     alias Rumbl.UserSocket 
    
     test "socket authentication with valid token" do 
       token = Phoenix.Token.sign(@endpoint, "user socket", "123") 
    
       assert {:ok, socket} = connect(UserSocket, %{"token" => token}) 
       assert socket.assigns.user_id == "123" 
     end 
    
     test "socket authentication with invalid token" do 
       assert :error = connect(UserSocket, %{"token" => "123"}) 
       assert :error = connect(UserSocket, %{}) 
     end 
   end

単純にトークンを作った後にちゃんと処理ができるということを確かめているテストとトークン作らない場合に失敗するテストを書いています。

============================================
Channelのテスト
============================================

認証が正しく出来ていることは確認できたので、本物の ``channel`` のテストを行います。
``video_channel_test.exs`` を以下の内容で実装します。

.. code-block:: Elixir

   defmodule Rumbl.Channels.VideoChannelTest do
     use Rumbl.ChannelCase
     import Rumbl.TestHelpers
   
     setup do
       user = insert_user(name: "Rebecca")
       video = insert_video(user, title: "Testing")
       token = Phoenix.Token.sign(@endpoint, "user socket", user.id)
       # コネクションのシュミレート
       {:ok, socket} = connect(Rumbl.UserSocket, %{"token" => token})
   
       {:ok, socket: socket, user: user, video: video}
     end
   
     test "join replies with video annotations", %{socket: socket, video: vid} do
       for body <- ~w(one two) do
         vid
         |> build_assoc(:annotations, %{body: body})
         |> Repo.insert!()
       end
       # チャンネルへの参加
       {:ok, reply, socket} = subscribe_and_join(socket, "videos:#{vid.id}", %{})
       # 正しいチャンネルに参加していること
       assert socket.assigns.video_id == vid.id
       # annotationがすべて取得出来ていること
       assert %{annotations: [%{body: "one"}, %{body: "two"}]} = reply
     end
   
     test "inserting new annotations", %{socket: socket, video: vid} do
       {:ok, _, socket} = subscribe_and_join(socket, "videos:#{vid.id}", %{})
       # イベントをチャンネルにプッシュ
       ref = push socket, "new_annotation", %{body: "the body", at: 0}
       assert_reply ref, :ok, %{}
       assert_broadcast "new_annotation", %{}
     end
   
     test "new annotations triggers InfoSys", %{socket: socket, video: vid} do
         insert_user(username: "wolfram")
       {:ok, _, socket} = subscribe_and_join(socket, "videos:#{vid.id}", %{})
       ref = push socket, "new_annotation", %{body: "1 + 1", at: 123}
       assert_reply ref, :ok, %{}
       assert_broadcast "new_annotation", %{body: "1 + 1", at: 123}
       assert_broadcast "new_annotation", %{body: "2", at: 123} 
     end
   end

普通にテストしているので余り書くことも無い気がします・・・
強いていうなら ``push`` でイベントをシュミレートしているのと、ユーザが ``wolfram`` であること前提となっているのを
カバーしている点くらいな気がします。

ここまでで ``mix test`` を実施すればすべて通るはずです。
書籍の内容はここまでで完了ですが、個人的にリリース方法が知りたかったのもあったので調べてやってみます。

============================================
リリース準備
============================================

``Phoenix`` を含む ``umbrella`` プロジェクトをリリースしてみます。
プログラミングElixirとかだと ``Exrm`` を利用しているようですが、
新しい方ということで ``distillery`` を使います。
また、 ``prod.secret.ex`` の有無とかも省きます。なければ適当に用意してください。

これもリリース用のライブラリですが、 ``Exrm`` より強化されて ``umbrella`` プロジェクトへの
対応など強化されているようです。

``rumbrella/mix.exs`` の ``deps`` に以下を追加します。

.. code-block:: Elixir

   defp deps do
     [{:distillery, "~> 1.0"}]
   end

``mix deps.get`` を実行しておきます。
ここから先は `ここ <https://medium.com/@brucepomeroy/create-an-elixir-umbrella-project-containing-a-phoenix-app-and-build-a-release-with-distillery-46371f2617df#.6txl9w2cf>`_ とか、
`公式ドキュメント <https://hexdocs.pm/distillery/getting-started.html>`_ とかを参考にします。

まず初めに ``production`` 環境で ``ecto.create`` とかをしておきます。

.. code-block:: shell

   rumbrella $ MIX_ENV=prod mix ecto.create
   rumbrella $ MIX_ENV=prod mix ecto.migrate
   rumbrella $ MIX_ENV=prod mix run ./apps/rumbl/priv/repo/seeds.exs
   rumbrella $ MIX_ENV=prod mix run ./apps/rumbl/priv/repo/backend_seeds.exs

こんな感じで適当にDBを準備しておきます。

次に ``assets`` ファイルを準備します。

.. code-block:: shell

   rumbrella $ MIX_ENV=prod mix phoenix.digest

また、 ``package.json`` に書いてあるとおり、静的ファイルをリリース用にビルドします。

.. code-block:: shell

   rumbrella $ cd ./apps/rumbl
   rumbl $ npm run deploy

次にリリース用に設定ファイルとかを生成します。

.. code-block:: shell

   rumbrella $ MIX_ENV=prod mix release.init

これやると ``rumbrella/rel`` とかいうフォルダが生成されます。
これでリリースといきたいですが、 ``:httpc`` の依存を設定ファイルに切っておきます。
``rumbl/mix.exs`` です。

.. code-block:: Elixir

   def application do
     [mod: {Rumbl, []},
      applications: [:phoenix, :phoenix_pubsub, :phoenix_html, :cowboy, :logger, :gettext,
                     :phoenix_ecto, :postgrex, :comeonin, :inets, :info_sys]]
   end

``:inets`` を追加しました。これがないとリリースビルド後の実行でエラーになります。
また、リリース用設定を ``rumbl`` 側にもしておきます。 ``prod.exs`` です。

.. code-block:: Elixir

   config :rumbl, Rumbl.Endpoint,
     http: [port: 4001],
     url: [host: "localhost", port: 8080],
     cache_static_manifest: "priv/static/manifest.json",
     server: true # リリース用サーバー開始設定

ここまでやってリリースビルドです。

.. code-block:: shell

   rumbrella $ MIX_ENV=prod mix release --env=prod
   ==> Assembling release..
   ==> Building release rumbrella:0.1.0 using environment prod
   ==> Including ERTS 8.2 from /usr/local/Cellar/erlang/19.2/lib/erlang/erts-8.2
   ==> Packaging release..
   ==> Release successfully built!
       You can run it in one of the following ways:
         Interactive: _build/prod/rel/rumbrella/bin/rumbrella console
         Foreground: _build/prod/rel/rumbrella/bin/rumbrella foreground
         Daemon: _build/prod/rel/rumbrella/bin/rumbrella start

こんな感じのメッセージがでるので ``_build/prod/rel/rumbrella/bin/rumbrella console`` コマンドを実行すると
実行できます。 ``http://localhost:4001`` でいけるはずです。

============================
まとめ
============================

- ``channel`` のテストも他のと同様な感覚で書くことが可能
- リリースには ``distillery`` を利用する

これで本の内容+αが終了です。リリースも簡単ですね。
そのうち何か作ろうと思いますが、趣味の言語あさりとかを優先してるかもしれないです。
