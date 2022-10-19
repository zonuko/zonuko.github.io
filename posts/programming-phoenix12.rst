---
date: 2017-01-29 18:00
tags:
  - phoenix
  - elixir
  - programming
description: Programming Phoenixって本を読むその12
title: Programming Phoenix勉強その12
slug: programming-phoenix12
related_posts: programming-phoenix11
---

Programming Phoenix勉強その12
################################

その12です。テストの続きです。ビュー周りのテストからです。

============================================
テンプレートのテスト
============================================

何個か前の章でやったようにテンプレートのレンダリングも単なる関数なので簡単にテスト可能です。

.. code-block:: Elixir

   defmodule Rumbl.VideoViewTest do
     use Rumbl.ConnCase, async: true
     import Phoenix.View
   
     test "renders index.html", %{conn: conn} do
       videos = [%Rumbl.Video{id: "1", title: "dogs"},
                 %Rumbl.Video{id: "2", title: "cats"}]
       # テンプレートを文字列としてレンダリングする
       content = render_to_string(Rumbl.VideoView, "index.html", 
         conn: conn, videos: videos)
   
       assert String.contains?(content, "Listing videos")
       # 内包表記は中の式は評価される
       for video <- videos do
         assert String.contains?(content, video.title)
       end
     end
   
     test "renders new.html", %{conn: conn} do
       changeset = Rumbl.Video.changeset(%Rumbl.Video{})
       categories = [{"cats", 123}]
   
       content = render_to_string(Rumbl.VideoView, "new.html",
         conn: conn, changeset: changeset, categories: categories)
       
       assert String.contains?(content, "New video")
     end
   end

注目すべきは ``render_to_string`` 関数でテンプレートを文字列としてレンダリングしている点かと思います。
実際にレンダリングをHTMLとして行わなくてもテストが出来ています。 ``render_to_string`` 関数のオプションにテンプレート側で使う変数を割り当てられるようです。

============================================
モデルのテスト（非同期）
============================================

モデルのテストを行う前に ``model_case.ex`` を確認しておきます。ついでに ``import Rumbl.TestHelpers`` を追記もしておきます。

.. code-block:: Elixir

   defmodule Rumbl.ModelCase do
   
     use ExUnit.CaseTemplate
   
     using do
       quote do
         alias Rumbl.Repo
   
         import Ecto
         import Ecto.Changeset
         import Ecto.Query
   
         import Rumbl.TestHelpers
         import Rumbl.ModelCase
       end
     end
   
     setup tags do
       :ok = Ecto.Adapters.SQL.Sandbox.checkout(Rumbl.Repo)
   
       unless tags[:async] do
         Ecto.Adapters.SQL.Sandbox.mode(Rumbl.Repo, {:shared, self()})
       end
   
       :ok
     end
   
     def errors_on(struct, data) do
       struct.__struct__.changeset(struct, data)
       |> Ecto.Changeset.traverse_errors(&Rumbl.ErrorHelpers.translate_error/1)
       |> Enum.flat_map(fn {key, errors} -> for msg <- errors, do: {key, msg} end)
     end
   end

書籍と比べて ``error_on`` 関数が変更されてますが余りきにしなくて良さそうです。ぱっとみエラーメッセージをマップに変更しているだけに見えます。

``model/user_test.exs`` を作成し以下のように実装します。

.. code-block:: Elixir

   defmodule Rumbl.UserTest do
     use Rumbl.ModelCase, async: true
     alias Rumbl.User
   
     @valid_attrs %{name: "A User", username: "eva", password: "secret"}
     @invalid_attrs %{}
   
     test "changeset with valid attributes" do
       changeset = User.changeset(%User{}, @valid_attrs)
       assert changeset.valid?
     end
   
     test "changeset with invalid attributes" do
       changeset = User.changeset(%User{}, @invalid_attrs)
       refute changeset.valid?
     end
   
     test "changeset does not accepts long usernames" do
       attrs = Map.put(@valid_attrs, :username, String.duplicate("a", 30))
   
       assert {:username, "should be at most 20 character(s)"} in
         errors_on(%User{}, attrs)
     end
   
     test "registration_changeset password must be at least 6 chars long" do
       attrs = Map.put(@valid_attrs, :password, "12345")
       changeset = User.registration_changeset(%User{}, attrs)
       assert {:password, {"should be at least %{count} character(s)", [count: 6, validation: :length, min: 6]}}
         in changeset.errors
     end
   
     test "registration_changeset with valid attributes hashes password" do
       attrs = Map.put(@valid_attrs, :password, "123456")
       changeset = User.registration_changeset(%User{}, attrs)
   
       %{password: pass, password_hash: pass_hash} = changeset.changes
   
       assert changeset.valid?
       assert pass_hash
       assert Comeonin.Bcrypt.checkpw(pass, pass_hash)
     end
   end

``erros_on`` を使っている場所は `ここを参考 <https://forums.pragprog.com/forums/393/topics/14486>`_  にしました。
これらのテストは副作用を起こさないテストでまとめたため、 ``async: true`` にして並列実行しているようです。

============================================
副作用のあるテスト
============================================

副作用が無く非同期に実行できるテストに対して、実際に ``Repo.insert`` したりするようなテストは副作用が発生します。その為、同じモデルのテストでも副作用あり/無しで分離してテストを書きます。

``model/user_repo_test.exs`` を以下のように作成します。

.. code-block:: Elixir

   defmodule Rumbl.UserRepoTest do
     use Rumbl.ModelCase
     alias Rumbl.User
   
     @valid_attrs %{name: "A User", username: "eva"}
   
     test "converts unique_constraint on username to error" do
       insert_user(username: "eric")
       attrs = Map.put(@valid_attrs, :username, "eric")
       changeset = User.changeset(%User{}, attrs)
   
       assert {:error, changeset} = Repo.insert(changeset)
       # changeset.errorsはキーワードリストになっている
       # キーワードリストの各要素は最初の値がアトムとなるタプルとしても認識される
       assert {:username, {"has already been taken", []}} in changeset.errors
     end
   end

実際にインサートを行っている以外には大した違いが無いです。 ``async`` オプションはデフォルトで ``false`` なので指定をしていません。
関係ないですが、キーワードリストについて忘れてて若干ハマりました・・・

同様に ``category_repo_test.exs`` を以下のように作ります。

.. code-block:: Elixir

   defmodule Rumbl.CategoryRepoTest do
     use Rumbl.ModelCase
     alias Rumbl.Category
   
     test "alphabetical/1 orders by name" do
       Repo.insert!(%Category{name: "c"})
       Repo.insert!(%Category{name: "a"})
       Repo.insert!(%Category{name: "b"})
   
       query = Category |> Category.alphabetical()
       query = from c in query, select: c.name
       assert Repo.all(query) == ~w(a b c)
     end
   end

別段躓くところはなかったです。

============================================
まとめ
============================================

- ビューは単なる関数なので ``render_to_string`` などを使って簡単にテストができる。
- 副作用が無いテストを分離することで非同期にテストを実行できる。

``NUnit`` とか使ってうっかり先に書いたテストに依存するようなテストを書いちゃうことは結構ありましたが、今回のように改めてテストの同期/非同期を意識したのは新鮮でした。
書籍の区分け的にはここで一段落です。以降からパート2に入ります。 ``Channel`` とかは目玉昨日の一つだと思うのでやっていきます。
