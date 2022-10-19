---
date: 2017-01-24 22:21
tags:
  - phoenix
  - elixir
  - programming
description: Programming Phoenixって本を読むその10
title: Programming Phoenix勉強その10
slug: programming-phoenix10
related_posts: programming-phoenix9
---


Programming Phoenix勉強その10
################################

その10です。
chapter7の続きです。

============================
Ecto.Queryの利用
============================

前のChapterで調べた ``Ecto.Query`` を利用して ``Category`` にソート用の ``query`` と取得用の ``query`` を生成できる関数を用意します。

.. code-block:: Elixir

   def alphabetical(query) do
     from c in query, order_by: c.name
   end

   def names_and_ids(query) do
     from c in query, select: {c.name, c.id}
   end

============================
テンプレートの準備
============================

カテゴリ一覧は取得できるようになったのでそれを表示できるようにしておきます。
``video/form.html.eex`` を以下のように編集します。

.. code-block:: ERB

   <%= form_for @changeset, @action, fn f -> %>
     ...
     <!-- 追加 -->
     <div class="form-group">
       <%= label f, :category_id, "Category", class: "control-label" %>
       <%= select f, :category_id, @categories, class: "form-control", prompt: "Choose a category" %>
     </div>
     ...
   <% end %>

``video/new.html.eex`` を以下のように編集します。

.. code-block:: ERB

   <h2>New video</h2>
 
   <%= render "form.html", changeset: @changeset, categories: @categories,
                           action: video_path(@conn, :create) %>
 
   <%= link "Back", to: video_path(@conn, :index) %>

``video/edit.html.eex`` を以下のように編集します。

.. code-block:: ERB

   <h2>Edit video</h2>
 
   <%= render "form.html", changeset: @changeset, categories: @categories,
                           action: video_path(@conn, :update, @video) %>
 
   <%= link "Back", to: video_path(@conn, :index) %>

============================
QueryのAPIについて
============================

``Query`` 構築の際に使えるものは以下

- ``==, !=, <=, >=,<,>``
- ``and, or, not``
- ``in``
- ``like,ilike``
- ``is_nil``
- ``count, avg, sum, min, max``
- ``datetime_add, date_add``
- ``fragment, field, type``

より柔軟に ``Query`` を使いたい場合は ``fragments`` を使うことが出来る。

.. code-block:: Elixir

   from(u in User, where: fragment("lower(username) = ?", ^String.downcase(uname)))

よくある静的プレースホルダと同じでしょうか。この方法でもセキュリティは担保されています。

もっと柔軟にクエリを投げたいときは以下のように直接SQLを実行できます。

.. code-block:: shell

   iex> Ecto.Adapters.SQL.query(Rumbl.Repo, "SELECT power($1, $2)", [2, 10])

クエリで関連するものも取りたい時は以下

.. code-block:: shell

   iex(6)> user = Repo.one from(u in User, limit: 1)
   [debug] QUERY OK source="users" db=16.0ms decode=15.0ms
   SELECT u0."id", u0."name", u0."username", u0."password_hash", u0."inserted_at", u0."updated_at" FROM "users" AS u0 LIMIT 1 []
   %Rumbl.User{__meta__: #Ecto.Schema.Metadata<:loaded, "users">, id: 1,
    inserted_at: ~N[2017-01-11 03:37:33.878000], name: "aaa", password: nil,
    password_hash: "$2b$12$L2IGA8kAewNvbOLJ0/c7i.4m6k18hAmuTSG4JuaHhyUK0qWfB0hae",
    updated_at: ~N[2017-01-16 03:40:31.371000], username: "aaa",
    videos: #Ecto.Association.NotLoaded<association :videos is not loaded>}
   iex(7)> user.videos # この時点ではNotLoaded
   #Ecto.Association.NotLoaded<association :videos is not loaded>
   iex(8)> user = Repo.preload(user, :videos) # preloadすると関連するものも取れる
   [debug] QUERY OK source="videos" db=78.0ms
   SELECT v0."id", v0."url", v0."title", v0."description", v0."user_id", v0."category_id", v0."inserted_at", v0."updated_at", v0."user_id" FROM "videos" AS v0 WHERE (v0."user_id" = $1)
    ORDER BY v0."user_id" [1]
   %Rumbl.User{__meta__: #Ecto.Schema.Metadata<:loaded, "users">, id: 1,
    inserted_at: ~N[2017-01-11 03:37:33.878000], name: "aaa", password: nil,
    password_hash: "$2b$12$L2IGA8kAewNvbOLJ0/c7i.4m6k18hAmuTSG4JuaHhyUK0qWfB0hae",
    updated_at: ~N[2017-01-16 03:40:31.371000], username: "aaa", videos: []}
   iex(9)> user.videos
   []

``Repo.preload`` 関数を使えば関連するものも一緒に取得できます。ただ、毎回 ``user`` の取得と ``preload`` を別々にやるのは面倒なので以下のようなオプションが良いされてます。

.. code-block:: shell

   iex(10)> user = Repo.one from(u in User, limit: 1, preload: [:videos])
   [debug] QUERY OK source="users" db=0.0ms
   SELECT u0."id", u0."name", u0."username", u0."password_hash", u0."inserted_at", u0."updated_at" FROM "users" AS u0 LIMIT 1 []
   [debug] QUERY OK source="videos" db=16.0ms
   SELECT v0."id", v0."url", v0."title", v0."description", v0."user_id", v0."category_id", v0."inserted_at", v0."updated_at", v0."user_id" FROM "videos" AS v0 WHERE (v0."user_id" = $1)
    ORDER BY v0."user_id" [1]
   %Rumbl.User{__meta__: #Ecto.Schema.Metadata<:loaded, "users">, id: 1,
    inserted_at: ~N[2017-01-11 03:37:33.878000], name: "aaa", password: nil,
    password_hash: "$2b$12$L2IGA8kAewNvbOLJ0/c7i.4m6k18hAmuTSG4JuaHhyUK0qWfB0hae",
    updated_at: ~N[2017-01-16 03:40:31.371000], username: "aaa", videos: []}
   iex(11)>

``join`` も普通に出来ます。

.. code-block:: shell

   iex(11)> Repo.all from u in User,
   ...(11)>   join: v in assoc(u, :videos),
   ...(11)>   join: c in assoc(v, :category),
   ...(11)>   where: c.name == "Comedy",
   ...(11)>   select: {u, v}
   [debug] QUERY OK source="users" db=31.0ms
   SELECT u0."id", u0."name", u0."username", u0."password_hash", u0."inserted_at", u0."updated_at", v1."id", v1."url", v1."title", v1."description", v1."user_id", v1."category_id", v1.
   "inserted_at", v1."updated_at" FROM "users" AS u0 INNER JOIN "videos" AS v1 ON v1."user_id" = u0."id" INNER JOIN "categories" AS c2 ON c2."id" = v1."category_id" WHERE (c2."name" =
   'Comedy') []
   []
   iex(12)>

============================
各制約について
============================

現状のアプリケーションはマイグレーションファイルに ``create unique_index(:users, [:username])`` とあり、重複するユーザーネームを登録しようとするとエラーになります。

.. image:: /images/Phoenix_error2.jpg
   :alt: Quicksilver

このままだと画面にエラーが出てしまうので ``changeset`` で受け取れるように変更してみます。 ``user.ex`` を編集します。

.. code-block:: Elixir

   def changeset(model, params \\ %{}) do
     model
     |> cast(params, [:name, :username]) # 更新予定のパラメータカラムを第三引数でとる(?)
     |> validate_required([:name, :username]) # このリストがcastが返すchangesetに存在するか検証
     |> validate_length(:username, min: 1, max: 20)
     |> unique_constraint(:username)
   end

``unique_constraint`` を最後のパイプラインに追加することで ``:username`` がかぶっていればエラーにしてくれます。

この調子で外部キー制約もエラーハンドリングできるようにします。 ``video.ex`` を以下のように変更します。
色々やった結果元の部分も間違っていたので修正してます。

.. code-block:: Elixir

   def changeset(struct, params \\ %{}) do
     struct
     |> cast(params, [:url, :title, :description, :category_id])
     |> validate_required([:url, :title, :description])
     |> assoc_constraint(:category)
   end

``validate_required`` の第三引数には何がはいるのだろうか・・・と思いましたが、 `公式ドキュメント <https://hexdocs.pm/ecto/Ecto.Changeset.html#content>`_ に書いてありました。 ``:message`` を取り、エラーメッセージをカスタマイズできるっぽいです。

これで外部制約も確かめることが出来ます。

.. code-block:: shell

   iex(1)> alias Rumbl.Repo
   iex(2)> alias Rumbl.Video
   iex(3)> alias Rumbl.Category
   iex(4)> import Ecto.Query
   iex(5)>  video = Repo.one(from v in Video, limit: 1)
   iex(6)> changeset = Video.changeset(video, %{category_id: 12345})
   iex(7)> Repo.update changeset
   [debug] QUERY OK db=0.0ms
   begin []
   [debug] QUERY ERROR db=46.0ms
   UPDATE "videos" SET "category_id" = $1, "updated_at" = $2 WHERE "id" = $3 [12345, {{2017, 1, 23}, {15, 2, 49, 366000}}, 1]
   [debug] QUERY OK db=0.0ms
   rollback []
   {:error,
    #Ecto.Changeset<action: :update, changes: %{category_id: 12345},
     errors: [category: {"does not exist", []}], data: #Rumbl.Video<>,
     valid?: false>}

良さそうです。

また、削除するときには ``foreign_key_constraint`` 関数が使えます。これを使うとカテゴリが削除出来ない理由をユーザに示す事ができます。

.. code-block:: shell

   iex> alias Rumbl.Repo
   iex> alias Rumbl.Category
   iex> alias Rumbl.Video
   iex> import Ecto.Query
   iex> import Ecto.Changeset
   iex> category = Repo.get_by Category, name: "Drama"
   iex> changeset = Ecto.Changeset.change(category)
   iex> changeset = foreign_key_constraint(changeset, :videos, name: :videos_category_id_fkey, message: "still exist")
   iex> Repo.delete changeset
   [debug] QUERY ERROR db=312.0ms
   DELETE FROM "categories" WHERE "id" = $1 [6]
   {:error,
    #Ecto.Changeset<action: :delete, changes: %{},
     errors: [videos: {"still exist", []}], data: #Rumbl.Category<>,
     valid?: false>}

``video`` のデータの中に既に ``Drama`` カテゴリーのIDを参照しているものがあれば設定したエラーを出してくれます。ちなみにどっかで書いたかもしれませんが ``Ecto.Changeset.change`` 関数は構造体とかからチェンジセット作ってくれる関数です。 ``cast`` やバリデーションを使いたくない時に使えるみたいです。（ `参考 <https://hexdocs.pm/ecto/Ecto.Changeset.html#change/2>`_ ）

もう一つの選択肢として、マイグレーション時に参照先が削除された時どうするかの設定が書けるみたいです。前に作った ``add_category_id_to_video`` を見てみます。

.. code-block:: Elixir

   defmodule Rumbl.Repo.Migrations.AddCategoryIdToVideo do
     use Ecto.Migration
   
     def change do
       alter table(:videos) do
         add :category_id, references(:categories)
       end
     end
   end

``add :category_id, references(:categories)`` の部分が肝です。 ``references(:categories)`` には ``:on_delete`` オプションが付けられるようです。

- ``:nothing`` ：デフォルト値。何もしない
- ``:delete_all`` ：関連するものも一緒に削除する
- ``:nilify_all`` ：関連するものが削除されたとき ``NULL`` にする


============================
まとめ
============================

- ``Query`` のAPIを使うことでデータベースへの柔軟な問合せができる。
- ``*_constraints`` を使うことで各制約のバリデーションを使える。

書籍の中には頻繁にデータベースでやることはデータベースの中でやるべきだとありました。また、全部に ``*_constraints`` 付けるのではなくクラッシュすべきところはクラッシュすべきとも書いてありました。ココらへんはElixirのLet's Crashの思想から来ているのかと思います。ユーザ側がどうにか出来る制約エラーの場合はカスタムエラーメッセージを出すと良いらしいです。（また英語力が・・・）
