---
date: 2017-01-28 17:21
tags:
  - phoenix
  - elixir
  - programming
description: Programming Phoenixって本を読むその11
title: Programming Phoenix勉強その11
slug: programming-phoenix11
related_posts: programming-phoenix10
---

Programming Phoenix勉強その11
################################

その11です。chapter8です。テストですよ

環境が ``test`` になるのでChapter7でやったWindows用コンパイルをやっておきます。細かい部分は省きます。

.. code-block:: shell

   rumbl> set "MIX_ENV=test" && mix deps.compile

============================================
テスト用に自動生成されるコードについて
============================================

テストを実行する前に自動生成された ``video_controller_test.exs`` を削除しておきます。

``conn_case.ex`` を見るとテストの初期設定がかいてあるっぽいです。ちなみに最新版だと書籍のやつと大分違います。

.. code-block:: Elixir

   defmodule Rumbl.ConnCase do
     use ExUnit.CaseTemplate
   
     using do
       quote do
         # Import conveniences for testing with connections
         use Phoenix.ConnTest
   
         alias Rumbl.Repo
         import Ecto
         import Ecto.Changeset
         import Ecto.Query
   
         import Rumbl.Router.Helpers
   
         # The default endpoint for testing
         @endpoint Rumbl.Endpoint
       end
     end
   
     setup tags do
       :ok = Ecto.Adapters.SQL.Sandbox.checkout(Rumbl.Repo)
   
       unless tags[:async] do
         Ecto.Adapters.SQL.Sandbox.mode(Rumbl.Repo, {:shared, self()})
       end
   
       {:ok, conn: Phoenix.ConnTest.build_conn()}
     end
   end

``using`` ブロックは対して違いが無いですが、 ``setup`` ブロックは大分違います。 `Ectoのドキュメント <https://hexdocs.pm/ecto/Ecto.Adapters.SQL.Sandbox.html>`_ を見て探ってみます。 
``Ecto.Adapters.SQL.Sandbox.checkout(Rumbl.Repo)`` では与えられたリポジトリに対してコネクションを取りに行っているようです。
次の ``Ecto.Adapters.SQL.Sandbox.mode(Rumbl.Repo, {:shared, self()})`` は接続の共有方法を指定しているようです。同期的にテストを行う場合はこちらのようです。（ ``allow/3`` 関数を使った非同期の方も書いてありましたが割愛します。）
また、これは ``checkout`` された接続と同じ接続を使うようなので ``checkout`` の後に呼び出すのが必須なようです。
接続に対して所有権の概念が導入されこのようになったようです。

============================================
ログアウト時のテストの実装
============================================

まずテストデータを作る関数を作ります。 ``test/support/test_helpers.ex`` を作ります。

.. code-block:: Elixir

   defmodule Rumbl.TestHelpers do
     alias Rumbl.Repo
   
     def insert_user(attrs \\ %{}) do
       # Dictをマージする キーが被っている時は第二引数のものが優先される
       changes = Enum.into(attrs, %{
         name: "Some User",
         username: "user#{Base.encode16(:crypto.rand_bytes(8))}",
         password: "supersecret",
       })
   
       %Rumbl.User{}
       |> Rumbl.User.registration_changeset(changes)
       |> Repo.insert!()
     end
   
     def insert_video(user, attrs \\ %{}) do
       user
       |> Ecto.build_assoc(:videos, attrs)
       |> Repo.insert!()
     end
   end

新しい目のElixirだと ``Dict`` がdeprecatedと怒られるので ``Enum.into`` に変えてます。第一引数の ``Enumerable`` を第二引数の ``Collectable`` のものに合体します。パイプでやろうかと思いましたが逆に見にくくなりそうだったのでやめました。

作った関数を各テストで使えるように ``import`` します。

.. code-block:: Elixir

   using do
     quote do
       # Import conveniences for testing with connections
       use Phoenix.ConnTest
 
       alias Rumbl.Repo
       import Ecto
       import Ecto.Changeset
       import Ecto.Query
 
       import Rumbl.Router.Helpers
       # 自分で実装したヘルパー関数を各テストで使えるようにする
       import Rumbl.TestHelpers
 
       # The default endpoint for testing
       @endpoint Rumbl.Endpoint
     end
   end

最後に ``video_controller_test.exs`` を作ります。

.. code-block:: Elixir

   defmodule Rumbl.VideoControllerTest do
     use Rumbl.ConnCase
   
     test "requires user authentication on all actions", %{conn: conn} do
       Enum.each([
         get(conn, video_path(conn, :new)),
         get(conn, video_path(conn, :index)),
         get(conn, video_path(conn, :show, "123")),
         get(conn, video_path(conn, :edit, "123")),
         put(conn, video_path(conn, :update, "123", %{})),
         post(conn, video_path(conn, :create, %{})),
         delete(conn, video_path(conn, :delete, "123")),
       ], fn conn ->
         assert html_response(conn, 302) # ユーザ認証が必要なので全部設定されたパスにリダイレクトされる
         assert conn.halted # 認証が行われていないのでhaltedはtrueになる
       end)
     end
   end

ユーザ認証が行われていない時にちゃんとリダイレクトされて ``halted`` が ``true`` になっているかテストをしています。このテストは ``mix test`` で実行した時にパスするはずです。

============================================
ログイン時のテストの実装
============================================

ログアウトときたらログインということで実装してみます。

まずテスト時にログインしてないと話にならないのでそこら辺からやっていきます。 ``auth.ex`` の ``call/2`` 関数を変更します。

.. code-block:: Elixir

   def call(conn, repo) do
     user_id = get_session(conn, :user_id)
     cond do
       user = conn.assigns[:current_user] ->
         conn
       user = user_id && repo.get(Rumbl.User, user_id) ->
         # assignでconnを変更する(importされた関数)
         # これによって:current_userがコントローラやビューで使えるようになる
         assign(conn, :current_user, user)
       true ->
         assign(conn, :current_user, nil)
     end
   end

``cond`` で場合分けをしていて、カレントユーザがすでに入ればそのまま ``conn`` を返します。これで ``:current_user`` を突っ込んだ後にこいつを呼び出せばそのまま処理に移れるはずです。

次に ``video_controller_test.exs`` を以下のように変更します。

.. code-block:: Elixir

   defmodule Rumbl.VideoControllerTest do
     use Rumbl.ConnCase
     alias Rumbl.Video
     @valid_attrs %{url: "http://youtu.be", title: "vid", description: "a vid"}
     @invalid_attrs %{title: "invalid"}
   
     defp video_count(query), do: Repo.one(from v in query, select: count(v.id))
   
     setup %{conn: conn} = config do
       if username = config[:login_as] do
         # ログインしておいて欲しいときはこっち
         user = insert_user(username: "max")
         conn = assign(conn, :current_user, user)
         {:ok, conn: conn, user: user}
       else
         # ログインしてほしくないときはこっち
         :ok 
       end
     end
   
     test "requires user authentication on all actions", %{conn: conn} do
       Enum.each([
         get(conn, video_path(conn, :new)),
         get(conn, video_path(conn, :index)),
         get(conn, video_path(conn, :show, "123")),
         get(conn, video_path(conn, :edit, "123")),
         put(conn, video_path(conn, :update, "123", %{})),
         post(conn, video_path(conn, :create, %{})),
         delete(conn, video_path(conn, :delete, "123")),
       ], fn conn ->
         assert html_response(conn, 302) # ユーザ認証が必要なので全部設定されたパスにリダイレクトされる
         assert conn.halted # 認証が行われていないのでhaltedはtrueになる
       end)
     end
   
     @tag login_as: "max"
     test "lists all user's videos on index", %{conn: conn, user: user} do
       user_video = insert_video(user, title: "funny cats")
       other_video = insert_video(insert_user(username: "other"), title: "another video")
   
       conn = get conn, video_path(conn, :index)
       assert html_response(conn, 200) =~ ~r/Listing videos/
       assert String.contains?(conn.resp_body, user_video.title)
       refute String.contains?(conn.resp_body, other_video.title)
     end
   
     @tag login_as: "max"
     test "creates user video and redirects", %{conn: conn, user: user} do
       conn = post conn, video_path(conn, :create), video: @valid_attrs
       assert redirected_to(conn) == video_path(conn, :index)
       assert Repo.get_by!(Video, @valid_attrs).user_id == user.id
     end
   
     @tag login_as: "max"
     test "does not create video and renders errors when invalid", %{conn: conn} do
       count_before = video_count(Video)
       conn = post conn, video_path(conn, :create), video: @invalid_attrs
       assert html_response(conn, 200) =~ "check the errors"
       assert video_count(Video) == count_before
     end
   
     @tag login_as: "max"
     test "autorizes actions against access by other users", %{user: owner, conn: conn} do
       video = insert_video(owner, @valid_attrs)
       non_owner = insert_user(username: "sneaky")
       conn = assign(conn, :current_user, non_owner)
   
       assert_error_sent :not_found, fn->
         get(conn, video_path(conn, :show, video))
       end
   
       assert_error_sent :not_found, fn ->
         get(conn, video_path(conn, :edit, video))
       end
   
        assert_error_sent :not_found, fn ->
         get(conn, video_path(conn, :update, video, video: @valid_attrs))
       end
       
        assert_error_sent :not_found, fn ->
         get(conn, video_path(conn, :delete, video))
       end
     end
   end

``video_controller`` に対するテストを一気に追加しました。ポイントとなるのは以下だと思います。テスト自体にそんなに難しいところは無いと思います。

- ``setup`` の部分をタグによって場合分けした。それにより、ログイン時のテストにはタグを付けることでログアウト時のテストと一緒にテストが出来る。
- ``@～`` で共通で使えるリクエストパラメータを外出しした。

============================================
Plugのテスト
============================================

``Plug`` のテストも普通のテストと同じように書けます。

.. code-block:: Elixir

   defmodule Rumbl.AuthTest do
     use Rumbl.ConnCase
     alias Rumbl.Auth
   
     setup %{conn: conn} do
       conn =
         conn
         |> bypass_through(Rumbl.Router, :browser) # bypass_through関数でRouterを経由してconnを作る
         |> get("/")
   
       {:ok, %{conn: conn}}
     end
   
     test "authenticate_user halts when no current_user exists", %{conn: conn} do
       conn = Auth.authenticate_user(conn, [])
       assert conn.halted
     end
   
     test "authenticate_user continues when the current_user exists", %{conn: conn} do
       conn =
         conn
         |> assign(:current_user, %Rumbl.User{})
         |> Auth.authenticate_user([])
   
       refute conn.halted
     end
   
     test "login puts the user in the session", %{conn: conn} do
       login_conn =
         conn
         |> Auth.login(%Rumbl.User{id: 123})
         |> send_resp(:ok, "") # テスト用に:okをレスポンスとして返す
   
       next_conn = get(login_conn, "/")
       assert get_session(next_conn, :user_id) === 123
     end
   
     test "logout drops the session", %{conn: conn} do
       logout_conn =
         conn
         |> put_session(:user_id, 123)
         |> Auth.logout()
         |> send_resp(:ok, "")
   
       next_conn = get(logout_conn, "/")
       refute get_session(next_conn, :user_id)
     end
     
     test "call places user from session into assigns", %{conn: conn} do
       user = insert_user()
       # セッションにユーザIDをを入れてcallを呼び出す
       conn =
         conn
         |> put_session(:user_id, user.id)
         |> Auth.call(Repo)
   
       assert conn.assigns.current_user.id == user.id
     end
   
     test "call with no session sets current_user assign to nil", %{conn: conn} do
       # sessionに何も入れずにcallを呼び出す
       conn = Auth.call(conn, Repo)
       assert conn.assigns.current_user == nil
     end
   
     test "login with a valid username and pass", %{conn: conn} do
       user = insert_user(username: "me", password: "secret")
   
       {:ok, conn} =
         Auth.login_by_username_add_pass(conn, "me", "secret", repo: Repo)
   
       assert conn.assigns.current_user.id == user.id
     end
   
     test "login with a not found user", %{conn: conn} do
       assert {:error, :not_found, _conn} =
         Auth.login_by_username_add_pass(conn, "me", "secret", repo: Repo)
     end
   
     test "login with password mismatch", %{conn: conn} do
       _ = insert_user(username: "me", password: "secret")
   
       assert {:error, :unauthorized, _conn} =
         Auth.login_by_username_add_pass(conn, "me", "wrond", repo: Repo)
     end
   end

あまり書くことはないですが、 ``setup`` で ``bypass_through`` で各パイプを経由した ``conn`` を作っている点くらいだと思います。
セッションやらフラッシュメッセージが必要となるためです。

テストの高速化のために ``config/text.exs`` に以下を追加しておきます。

.. code-block:: Elixir

   # テストを高速化するためにハッシュの複雑差を変えて計算の時間を減らす
   config :comeonin, :bcrypt_log_rounds, 4
   config :comeonin, :pbkdf2_rounds, 1

============================================
まとめ
============================================

よくあるテストコードと余り変わらなくて特に書くことがない・・・今までの知識を総動員している感覚があります。
