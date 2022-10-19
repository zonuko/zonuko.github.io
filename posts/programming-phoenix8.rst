---
date: 2017-01-21 22:21
tags: 
  - programming
  - elixir
  - phoenix
related_posts: programming-phoenix7
description: Programming Phoenixって本を読むその8
title: Programming Phoenix勉強その8
---

Programming Phoenix勉強その8
################################

その8です。
ここからchapter6です。 ``Ecto`` をコードジェネレータを色々探るみたいです。

===========================
コードジェネレータの利用
===========================

早速コードジェネレータを使ってみます。 ``rumbl`` ビデオにコメントを付けられるアプリなので ``Video`` 周りが色々と必要そうです。
``Video`` 周りのものはコードジェネレータにおまかせしてみます。以下のコマンドを入力します。

.. code-block:: shell

   rumbl $ mix phoenix.gen.html Video videos user_id:references:users url:string title:string description:text

モデル名の複数形とかモジュール名とかフィールドの型情報とかを与えてやっています。
マイグレーションの前に下準備を行います。 
認証処理は共有で使いたいので ``user_controller.ex`` にあった ``authenticate/2`` 関数は ``auth.ex`` に外出して置きます。

.. code-block:: Elixir

   defmodule Rumbl.Auth do
     import Phoenix.Controller
     alias Rumbl.Router.Helpers
     ...
     def authenticate_user(conn, _opts) do
       # Plugで追加したassignの呼び出しが可能かどうか
       if conn.assigns.current_user do
         conn
       else
         conn
         |> put_flash(:error, "You must be logged in to access that page")
         |> redirect(to: Helpers.page_path(conn, :index))
         |> halt()
       end
     end
   end

``web.ex`` に以下を追加して全コントローラーとルーターで上記の認証関数を使えるようにします。

.. code-block:: Elixir

   ...
   def controller do
     quote do
       use Phoenix.Controller

       alias Rumbl.Repo
       import Ecto
       import Ecto.Query

       import Rumbl.Router.Helpers
       import Rumbl.Gettext
       import Rumbl.Auth, only: [authenticate_user: 2] # 追加
     end
   end
   ...
   def router do
     quote do
       use Phoenix.Router

       import Rumbl.Auth, only: [authenticate_user: 2] # 追加
     end
   end

 当然、 ``user_controller.ex`` の認証プラグも ``authenticate_user`` に変えておきます。
 ``router.ex`` に新しいスコープを追加します。

.. code-block:: Elixir

   scope "/manage", Rumbl do
     pipe_through [:browser, :authenticate_user]

     resouces "/videos", VideoController
   end

ここまで行ってマイグレーションを行います。
空白文字の扱いについては、 ``controller`` 内に ``scrub_param`` という ``Plug`` が定義されており、これによって自動で ``nil`` に変換されているらしいです。
ついでに ``Model`` を見に行くとバージョンの違いが結構生成されたものが異なってます。何個か前の章で書いた用に ``cast/4`` 関数が非推奨になっているからです。
``user_id`` を外部キーにしてるので、 ``user.ex`` も変更しておきます。

.. code-block:: Elixir

   schema "users" do
     field :name, :string
     field :username, :string
     field :password, :string, virtual: true
     field :password_hash, :string
     has_many :videos, Rumbl.Video # 追加

     timestamps()
   end

===========================
Ectoについて
===========================

ここで説明される ``Ecto`` の関数は以下

- ``Ecto.build_assoc/3`` 
    第一引数と関連する第二引数引数の構造体を第三引数の ``Map`` の構造で作る

- ``Ecto.assoc/2``
    第一引数に対して ``has_many`` になっている第二引数の構造体を取り出すクエリを生成する。コンソール見ると LINQ to SQLっぽいのが流れてた

毎回のように翻訳と理解が正しいか怪しい・・・

============================
自動生成されたコードの調整
============================

自動生成されたコードを調整します。
まずは ``video_controller.ex`` の ``:new`` アクションを変更します。

.. code-block:: Elixir

   def new(conn, _params) do
     changeset = 
       conn.assigns.current_user
       |> build_assoc(:videos) # current_userに関連するVideo構造体を作成
       |> Video.changeset() # 上記Video構造体からchangeset作成

     render(conn, "new.html", changeset: changeset)
   end

``Video`` の ``changeset`` を作るだけだったのをログイン中のユーザに関連する ``Video`` にするように変更しました。
``current_user`` は色んな所で出てきそうで鬱陶しいのでまとめられう方法を探します。幸いなことにカスタムアクションなるものがあるようです。
以下の関数を ``video_controller.ex`` に追加します。

.. code-block:: Elixir

   def action(conn, _) do
     apply(__MODULE__, action_name(conn), [conn, conn.params, conn.assigns.current_user])
   end

パット見わけがわかりませんが簡単です。
まず ``apply/3`` 関数はモジュール名、関数名のアトム、その関数に適用する引数を取る関数です。（ `Elixirの組み込みです。 <https://hexdocs.pm/elixir/Kernel.html>`_ ）
``__MODULE__`` は現在のモジュール名で、 ``action_name/1`` は ``conn`` が要求するアクション名を返してくる関数です。（ `Phoenix側で用意されている。 <https://hexdocs.pm/phoenix/Phoenix.Controller.html>`_ ）
こんな感じにしてやると ``video_controller.ex`` の全アクションは上記の第三引数の引数を取るようにカスタマイズされてくれます。
なのでアクションを書き換えます。

.. code-block:: Elixir

   defmodule Rumbl.VideoController do
     use Rumbl.Web, :controller
 
     alias Rumbl.Video
 
     # カスタムアクションで各アクションをカスタマイズする
     def action(conn, _) do
       # 第一引数のモジュールの第二引数の関数に第三引数の引数を渡して実行する
       apply(__MODULE__, action_name(conn), [conn, conn.params, conn.assigns.current_user])
     end
 
     def index(conn, _params, user) do
       videos = Repo.all(user_videos(user))
       render(conn, "index.html", videos: videos)
     end
 
     def new(conn, _params, user) do
       changeset = 
         user
         |> build_assoc(:videos) # current_userに関連するVideo構造体を作成
         |> Video.changeset() # 上記Video構造体からchangeset作成中身は空
 
       render(conn, "new.html", changeset: changeset)
     end
 
     def create(conn, %{"video" => video_params}, user) do
       changeset = 
         user
         |> build_assoc(:videos) # current_userに関連するVideo構造体を作成
         |> Video.changeset(video_params) # 上記Video構造体からchangeset作成
 
       case Repo.insert(changeset) do
         {:ok, _video} ->
           conn
           |> put_flash(:info, "Video created successfully.")
           |> redirect(to: video_path(conn, :index))
         {:error, changeset} ->
           render(conn, "new.html", changeset: changeset)
       end
     end
 
     def show(conn, %{"id" => id}, user, user) do
       video = Repo.get!(user_videos(user), id)
       render(conn, "show.html", video: video)
     end
 
     def edit(conn, %{"id" => id}, user) do
       video = Repo.get!(user_videos(user), id)
       changeset = Video.changeset(video)
       render(conn, "edit.html", video: video, changeset: changeset)
     end
 
     def update(conn, %{"id" => id, "video" => video_params}, user) do
       video = Repo.get!(user_videos(user), id)
       changeset = Video.changeset(video, video_params)
 
       case Repo.update(changeset) do
         {:ok, video} ->
           conn
           |> put_flash(:info, "Video updated successfully.")
           |> redirect(to: video_path(conn, :show, video))
         {:error, changeset} ->
           render(conn, "edit.html", video: video, changeset: changeset)
       end
     end
 
     def delete(conn, %{"id" => id}, user) do
       video = Repo.get!(user_videos(user), id)
 
       # Here we use delete! (with a bang) because we expect
       # it to always work (and if it does not, it will raise).
       Repo.delete!(video)
 
       conn
       |> put_flash(:info, "Video deleted successfully.")
       |> redirect(to: video_path(conn, :index))
     end
 
     defp user_videos(user) do
       assoc(user, :videos)
     end
   end

``current_user`` を取り出して使っていたのをカスタムアクションによって引数で取ることができるようになりました。
``show`` アクションなどではユーザに関係のある一覧が欲しいので ``user_videos/1`` 関数を用意してあります。
これで ``Video`` 周りの実装は一旦修了です。

==================================
まとめ
==================================

- ``assoc`` で対象に関係のあるデータが取得できる。
- コードジェネレータやルーティングについては他の言語とほとんど変わりがない
