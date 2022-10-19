---
date: 2017-01-22 22:21
tags:
  - phoenix
  - elixir
  - programming
description: Programming Phoenixって本を読むその9
title: Programming Phoenix勉強その9
slug: programming-phoenix9
related_posts: programming-phoenix8
---


Programming Phoenix勉強その9
################################

その9です
ここからchapter7です。 ``Ecto`` の続きっぽいです。

============================
videoのカテゴリー追加
============================

ビデオにカテゴリーを付けられるようにします。ジェネレータを使って ``category`` モデルを生成します。ついでに色々準備もします。
以下のコマンドを実行します。

.. code-block:: shell

   rumbl $ mix phoenix.gen.model Category categories name:string

出来上がったマイグレーションファイルを編集します。 ``NOT NULL`` 制約とか付けます。

.. code-block:: Elixir

   defmodule Rumbl.Repo.Migrations.CreateCategory do
     use Ecto.Migration
 
     def change do
       create table(:categories) do
         add :name, :string, null: false
 
         timestamps()
       end
 
       create unique_index(:categories, [:name])
     end
   end

``video.ex`` を ``Category`` に紐付けるように変更します。

.. code-block:: Elixir

   defmodule Rumbl.Video do
     use Rumbl.Web, :model
 
     schema "videos" do
       field :url, :string
       field :title, :string
       field :description, :string
       belongs_to :user, Rumbl.User
 
       belongs_to :category, Rumbl.Category
 
       timestamps()
     end
 
     @doc """
     Builds a changeset based on the `struct` and `params`.
     """
     def changeset(struct, params \\ %{}) do
       struct
       |> cast(params, [:url, :title, :description])
       |> validate_required([:url, :title, :description], [:category_id])
     end
   end

例に漏れず ``cast/4`` じゃなくなってるので適当に公式ドキュメント見て辻褄合わせしてます。
``video`` モデルに ``category_id`` を追加するためのマイグレーションファイルを作ります。

.. code-block:: shell

   rumbl $ mix ecto.gen.migration add_category_id_to_video

出来上がったファイルを編集します。

.. code-block:: Elixir

   defmodule Rumbl.Repo.Migrations.AddCategoryIdToVideo do
     use Ecto.Migration
 
     def change do
       alter table(:videos) do
         add :category_id, references(:categories)
       end
 
     end
   end

マイグレーションを実行します。いつものコマンドです。
マイグレーション出来たら ``seeds.exs`` を編集して初期データを作ります。カテゴリー名は他の要素で編集されない固定の値だからです。

.. code-block:: Elixir

   alias Rumbl.Repo
   alias Rumbl.Category
 
   for category <- ~w(Action Drama Romance Comedy Sci-fi) do
     # カテゴリがすでに存在するか確認して無ければ入れる
     Repo.get_by(Category, name: category) || Repo.insert!(%Category{name: category})
   end

用意したら ``mix run priv/repo/seeds.ex`` コマンドを実行すればシードデータ投入完了です。
ここまでの流れも余り違和感も不思議なところも無いかと思います。

============================
Ectoについて
============================

ここで ``Ecto`` の ``Query`` とかについて軽く解説がありました。
``iex`` で以下のコマンドを入力すると何が起こっているかわかります。

.. code-block:: shell

   iex(1)> import Ecto.Query
   Ecto.Query
   iex(2)> alias Rumbl.Repo 
   Rumbl.Repo
   iex(3)> alias Rumbl.Category
   Rumbl.Category
   iex(4)> Repo.all from c in Category, select: c.name
   [debug] QUERY OK source="categories" db=188.0ms decode=15.0ms
   SELECT c0."name" FROM "categories" AS c0 []
   ["Action", "Drama", "Romance", "Comedy", "Sci-fi"]
   iex(5)>

上記を見てわかるのは

- ``Repo.all`` は ``Ecto.Query`` を取る
- ``Ecto.Query`` は ``from`` マクロで作れる
- ``from`` マクロ以降の使い方は ``LINQ to SQL`` のクエリ式っぽく書ける

``LINQ to SQL`` のクエリ式に馴染みがあるとすんなり受け入れられそうです。メソッドとかでラップされない分柔軟に使えそうだなと思いました。分解して構築することも可能です。

.. code-block:: shell

   iex(6)> query = Category
   Rumbl.Category
   iex(7)> query = from c in query, order_by: c.name
   #Ecto.Query<from c in Rumbl.Category, order_by: [asc: c.name]>
   iex(8)> query = from c in query, select: c.name
   #Ecto.Query<from c in Rumbl.Category, order_by: [asc: c.name], select: c.name>
   iex(9)> Repo.all query
   [debug] QUERY OK source="categories" db=47.0ms
   SELECT c0."name" FROM "categories" AS c0 ORDER BY c0."name" []
   ["Action", "Comedy", "Drama", "Romance", "Sci-fi"]
   iex(10)>

実際に ``Repo.all/1`` とかが引数として取れるものは ``Ecto.Queryable`` プロトコルを実装したものらしいです。
``Repo.all(Category)`` とかのような使い方が許されるのはこれらがプロトコルを実装しているからです。

============================
Ecto.Queryableについて
============================

ふと疑問に思って ``Category`` とか ``User`` とか ``Video`` とかに ``Ecto.Queryable`` プロトコル実装している部分はどこかと思って探しました。
ざっくり探った感じまず、 ``Ecto.Queryable`` の該当ソースを見ると以下のようになっています。

.. code-block:: Elixir

   defimpl Ecto.Queryable, for: Atom do
     def to_query(module) do
       try do
         module.__schema__(:query)
       rescue
         UndefinedFunctionError ->
           message = if :code.is_loaded(module) do
             "the given module does not provide a schema"
           else
             "the given module does not exist"
           end
 
           raise Protocol.UndefinedError,
             protocol: @protocol, value: module, description: message
       end
     end
   end

``for: Atom`` なんだからモジュールはだめじゃん？とか思われるかもしれませんが、モジュール名の実体は ``Atom`` なので問題ないです。
 モジュールに ``to_atom`` すると ``true`` になります。ちなみに ``Erlang`` のモジュールは小文字から始まって ``Elixir`` のモジュールは ``:'Elixir.Module'`` とかになっています。ココらへんはプログラミングElixirとかを参考にするとよいかもしれないです。

話を戻して、 ``try`` の部分を見ると ``module.__schema__(:query)`` となっていることがわかります。
じゃあ ``__schema__/1`` はどこにあるかというと ``Ecto.Schema`` に書いてあります。（内容は直接は関係ないのでおいておきます。）
ここまで見て一旦自分で ``Queryable`` なモジュールを作ってみました。

.. code-block:: Elixir

   defmodule Test do
     use Ecto.Schema
   end

これで以下を呼び出してみます。

.. code-block:: shell

   iex(0)> Ecto.Queryable.to_query(Test)
   ** (Protocol.UndefinedError) protocol Ecto.Queryable not implemented for Test, the given module does not provide a schema
     (ecto) lib/ecto/queryable.ex:37: Ecto.Queryable.Atom.to_query/1

モジュールの中に ``schema`` がないとだめとか言われているので適当に作ってみます。

.. code-block:: Elixir

   defmodule Test do
     use Ecto.Schema
 
     schema "test" do
     end
   end

これでさっきのをもっかい打ち込んでみます。

.. code-block:: shell

   iex(0)> Ecto.Queryable.to_query(Test)
   #Ecto.Query<from t in Test>

これでOKです。まとめておくと以下の点を満たすものが ``Queryable`` になっていると言ってよさそうです。

- ``Ecto.Schema`` を ``use`` している
- モジュール内で ``schema`` マクロを使っている

================
おまけ
================

``Ecto.Schema`` の ``__using__`` マクロを見てみると以下のようになっています。

.. code-block:: Elixir

   defmacro __using__(_) do
     quote do
       import Ecto.Schema, only: [schema: 2, embedded_schema: 1]
 
       @primary_key nil
       @timestamps_opts []
       @foreign_key_type :id
       @schema_prefix nil
 
       Module.register_attribute(__MODULE__, :ecto_primary_keys, accumulate: true)
       Module.register_attribute(__MODULE__, :ecto_fields, accumulate: true)
       Module.register_attribute(__MODULE__, :ecto_assocs, accumulate: true)
       Module.register_attribute(__MODULE__, :ecto_embeds, accumulate: true)
       Module.register_attribute(__MODULE__, :ecto_raw, accumulate: true)
       Module.register_attribute(__MODULE__, :ecto_autogenerate, accumulate: true)
       Module.register_attribute(__MODULE__, :ecto_autoupdate, accumulate: true)
       Module.put_attribute(__MODULE__, :ecto_autogenerate_id, nil)
     end
   end

``import Ecto.Schema, only: [schema: 2, embedded_schema: 1]`` となっているので ``schema/2`` マクロを見てみます。

.. code-block:: Elixir

   defmacro schema(source, [do: block]) do
     schema(source, true, :id, block)
   end
 
   defp schema(source, meta?, type, block) do
     quote do
         ...
       Module.eval_quoted __ENV__, [
         Ecto.Schema.__defstruct__(@struct_fields),
         Ecto.Schema.__changeset__(@changeset_fields),
         Ecto.Schema.__schema__(prefix, source, fields, primary_key_fields),
         Ecto.Schema.__types__(fields),
         Ecto.Schema.__assocs__(assocs),
         Ecto.Schema.__embeds__(embeds),
         Ecto.Schema.__read_after_writes__(@ecto_raw),
         Ecto.Schema.__autogenerate__(@ecto_autogenerate_id, autogenerate, autoupdate)]
     end
   end

``Module.eval_quoted`` となっています。 ``eval_quoted`` の `ドキュメントを見ると <https://hexdocs.pm/elixir/Module.html#eval_quoted/4>`_ ``quote`` を展開してモジュールに ``sum`` 関数を導入している例が見れます。
``Ecto.Schema.__schema__`` をみてみます。

.. code-block:: Elixir

   def __schema__(prefix, source, fields, primary_key) do
     field_names = Enum.map(fields, &elem(&1, 0))
 
     # Hash is used by the query cache to specify
     # the underlying schema structure did not change.
     # We don't include the source because the source
     # is already part of the query cache itself.
     hash = :erlang.phash2({primary_key, fields})
 
     quote do
       def __schema__(:query),       do: %Ecto.Query{from: {unquote(source), __MODULE__}, prefix: unquote(prefix)}
       def __schema__(:prefix),      do: unquote(prefix)
       def __schema__(:source),      do: unquote(source)
       def __schema__(:fields),      do: unquote(field_names)
       def __schema__(:primary_key), do: unquote(primary_key)
       def __schema__(:hash),        do: unquote(hash)
     end
   end

``quote`` の部分が評価されるのでこれで上記のドキュメントの例と同様に ``__schema__`` 関数がモジュールで使えるようになることがわかります。
やっぱメタプログラミングをもっと勉強しないとちゃんとソースの中身見るのはつらそうな気がします。

===========================
まとめ
===========================

- ``Ecto.Query`` は分解して書ける
- ``Repo.all`` の引数に取れるのは ``Ecto.Queryable`` プロトコルを実装したもののみ
- ``Ecto.Queryable`` になれるモジュールは ``use Ecto.Schema`` と ``schema`` を定義したモジュールになる。

気になったことを調べたら本題とは別の部分で長くなってしまいました・・・
