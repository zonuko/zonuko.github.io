---
date: 2017-01-31 22:00
tags:
  - phoenix
  - elixir
  - programming
description: Programming Phoenixって本を読むその14
title: Programming Phoenix勉強その14
slug: programming-phoenix14
related_posts: programming-phoenix13
---


Programming Phoenix勉強その14
################################

その14です。その13の続きです。追加した ``Slug`` をURLに使ってアクセスできるようにします。

============================================
URLのカスタマイズ
============================================

URLを単なるID指定から ``id`` + 先程作成した ``slug`` でアクセスできるようにします。

``Phoenix.Param`` を ``impl`` することでカスタマイズ可能です。

.. code-block:: Elixir

   defimpl Phoenix.Param, for: Rumbl.Video do
     def to_param(%{slug: slug, id: id}) do
       "#{id}-#{slug}"
     end
   end


`公式ドキュメント <https://hexdocs.pm/phoenix/Phoenix.Param.html>`_ を見ると単なる ``impl`` なら @derive {Phoenix.Param, key: :username} で行けるようです。
今回は ``"#{id}-#{slug}"`` などのちょっとカスタムされたURLでアクセスしたいので直接実装してます。（ ``derive`` で実装できる方法はあるのだろうか・・・）

``IEX`` で上記で作成したものを試してみます。


.. code-block:: shell

   iex> video = %Rumbl.Video{id: 1, slug: "hello"}
   iex> Rumbl.Router.Helpers.watch_path(%URI{}, :show, video)
   "/watch/1-hello"

``watch_path/3`` の第一引数が ``%URI{}`` となっています。すべてのヘルパーはこのURI構造体を第一引数を取るらしいです。

URI構造体を使ってちょっと遊んでみます。

.. code-block:: shell

   iex> url = URI.parse("http://example.com/prefix")
   %URI{authority: "example.com", fragment: nil, host: "example.com",
    path: "/prefix", port: 80, query: nil, scheme: "http", userinfo: nil}
   iex(6)> Rumbl.Router.Helpers.watch_url(url, :show, video)
   "http://example.com/prefix/watch/1-hello"

第一引数に与えたURLに続くパスとしてパスを構築してくれていることがわかります。じゃあ今使っている ``localhost`` のURLはどうなってんだという疑問がわきます。
以下を試してみます。

.. code-block:: shell

   iex> url = Rumbl.Endpoint.struct_url
   %URI{authority: nil, fragment: nil, host: "localhost", path: nil, port: 4000,
    query: nil, scheme: "http", userinfo: nil}
   iex(8)> Rumbl.Router.Helpers.watch_url(url, :show, video)
   "http://localhost:4000/watch/1-hello"

どうやら内部的には ``struct_url`` で全体のURLが構築されているらしいことがわかります。また、 ``url`` というAPIもあるようです。
こちらは文字列でURL全体を返してくれます。

ここまでやって、ウォッチページにとぼうとするとエラーになります。 ``watch_controller`` の ``:show`` アクションではURLパラメータとして
``:id`` を期待しているのに ``1-hello`` のようなパラメータが来ているためです。これからこの点を修正します。

============================================
リンクの修正
============================================

上記の問題を解決するためにリンクを修正します。 ``lib/rumbl/permalink.ex`` を実装します。
ちなみに ``lib`` フォルダと ``web`` フォルダの違いはコードリロードが走るかどうかの違いのようです。

.. code-block:: Elixir

   defmodule Rumbl.Permalink do
     # cast,dump,load,typeの実装を要求するbehaviour
     @behaviour Ecto.Type
   
     def type, do: :id
   
     # changesetのcast関数が呼び出される時とかクエリを構築する時とかに使われる
     # 文字列の場合
     def cast(binary) when is_binary(binary) do
       case Integer.parse(binary) do
         {int, _} when int > 0 -> {:ok, int}
         _ -> :error
       end
     end
   
     def cast(integer) when is_integer(integer) do
       {:ok, integer}
     end
   
     def cast(_) do
       :error
     end
   
     # データがデータベースに送信される時に呼び出される
     def dump(integer) when is_integer(integer) do
       {:ok, integer}
     end
   
     # データがデータベースからロードされる時に呼び出される
     def load(integer) when is_integer(integer) do
       {:ok, integer}
     end
   end

データが呼び出されたり、突っ込まれたりするときの動作を記述しています。
今回関係があるのは一つ目の ``cast/1`` 関数で、文字列を ``binary`` として受け取り、先頭の数字とそれ以外でパースしている部分です。

この処理により、 ``3-hello`` のようなパラメータも受取が可能になります。
上記作ったものを利用できるように ``video.ex`` を編集します。

.. code-block:: Elixir

   defmodule Rumbl.Video do
     use Rumbl.Web, :model
   
     # idフィールドのカスタマイズ 第二要素は型らしい
     @primary_key {:id, Rumbl.Permalink, autogenerate: true}
     schema "videos" do
       field :url, :string
       field :title, :string
       field :description, :string
       field :slug, :string
       belongs_to :user, Rumbl.User
   
       belongs_to :category, Rumbl.Category
   
       timestamps()
     end
   ...

``@praimary_key`` アトリビュートを使ってプライマリーキーをカスタマイズしています。
``:id`` 以外をキーとしたい場合も似たような感じで書けば出来るようです。

ここまでやればビデオ閲覧画面は完成です。

============================================
まとめ
============================================

- ``Phoenix.Param`` を ``impl`` することでURLパラメータがカスタマイズ出来る。
- ``@primary_key`` でプライマリーキーをカスタマイズ出来る。

ちょっと短かったです・・・バランスが難しい。

``@primary_key`` の2個目の要素の型指定とかまだちょっと疑問が残るので追々調べてみようと思います。
