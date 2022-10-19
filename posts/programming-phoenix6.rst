---
date: 2017-01-11 17:52
tags:
  - phoenix
  - elixir
  - programming
description: Programming Phoenixって本を読むその6
title: Programming Phoenix勉強その6
slug: programming-phoenix6
related_posts: programming-phoenix5
---


Programming Phoenix勉強その6
################################

その6です。
実際にDBを操作するところからです。

=========================
新規ユーザ生成処理
=========================

``Rumbl.UserController`` に以下の関数を実装します。

.. code-block:: Elixir

   def new(conn, _params) do
     changeset = User.changeset(%User{})
     render conn, "new.html", changeset: changeset
   end

``changeset`` 周りとかが謎めいていますが一旦置いときます。単に自分が今理解してないだけですが・・・
DBの操作とそれ以外の検証とかエラーとかセキュリティとかを分離するのに役立つっぽいです。
``user.ex`` に上記で利用している ``User.changeset`` 関数を実装します。

.. code-block:: Elixir

   def changeset(model, params \\ :empty) do
     model
     |> cast(params, ~w(name username), [])
     |> validate_length(:username, min: 1, max: 20)
   end

``Ecto`` を使う関数を定義しました。 ``cast`` で ``Ecto.changeset`` を生成してバリデーションチェックを掛けているようです。

=========================
前準備
=========================

``:new`` アクションを実装する前に前準備をします。
今まで書いてあったルーティング設定を消して以下を追加します。まぁ説明不要だと思います。

.. code-block:: Elixir

   resouces "/users", UserController, only: [:index, :show, :new, :create]

=========================
テンプレート実装
=========================

``:new`` に対応するテンプレートを適当に作ります。

.. code-block:: ERB

   <h1>New User</h1>
 
   <%= form_for @changeset, user_path(@conn, :create), fn f -> %>
     <div class="form-group">
       <%= text_input f, :name, placeholder: "Name", class: "form-control" %>
     </div>
     <div class="form-group">
       <%= text_input f, :username, placeholder: "Username", class: "form-control" %>
     </div>
     <div class="form-group">
       <%= password_input f, :password, placeholder: "Password", class: "form-control" %>
     </div>
     <%= submit "Create User", class: "btn, btn-primary" %>
   <% end %>

 ここまでやって起動したところ、何やらWarningが出たので解消します。

.. code-block:: shell

   warning: `Ecto.Changeset.cast/4` is deprecated, please use `cast/3` + `validate_required/3` instead
       (rumbl) web/models/user.ex:15: Rumbl.User.changeset/2
       (rumbl) web/controllers/user_controller.ex:16: Rumbl.UserController.new/2
       (rumbl) web/controllers/user_controller.ex:1: Rumbl.UserController.action/2
       (rumbl) web/controllers/user_controller.ex:1: Rumbl.UserController.phoenix_controller_pipeline/2
 
   warning: passing :empty to Ecto.Changeset.cast/3 is deprecated, please pass an empty map or :invalid instead
       (rumbl) web/models/user.ex:15: Rumbl.User.changeset/2
       (rumbl) web/controllers/user_controller.ex:16: Rumbl.UserController.new/2
       (rumbl) web/controllers/user_controller.ex:1: Rumbl.UserController.action/2
       (rumbl) web/controllers/user_controller.ex:1: Rumbl.UserController.phoenix_controller_pipeline/2

=========================
Warningの解消
=========================

``Ecto`` とかのバージョの違いのせいか2つWarningが出てました。1つは ``user.ex`` の ``changeset/2`` 関数のデフォルト引数で ``:empty`` としていた部分です。
その部分を以下のように変えます。

.. code-block:: Elixir

   def changeset(model, params \\ %{}) do

単純に空の ``Map`` にしただけですね。
もう1つ ``cast/4`` 関数を呼び出している部分でもWarningが出ているので修正します。

.. code-block:: Elixir

   model
   |> cast(params, [:name, :username])
   |> validate_required([:name, :username])
   |> validate_length(:username, min: 1, max: 20)

`ここ <http://www.phoenixframework.org/docs/ecto-models>`_ とか `ここらへん <https://hexdocs.pm/ecto/Ecto.Changeset.html#cast/4>`_ 参考にしましたが英語力の無さ故にあってるかわからないです。誰か教えて!!
 パラメータの名前的にはあってそうですが・・・
また、これを見ると ``cast`` が ``changeset`` を返してきて、それに対してバリデーションを掛けているのがわかります。

=========================
Createアクションの実装
=========================

``new`` アクションを実装したので実際にDBにインサートする ``create`` アクションを実装します。

.. code-block:: Elixir

   def create(conn, %{"user" => user_params}) do
     changeset = User.changeset(%User{}, user_params)
     case Repo.insert(changeset) do
       {:ok, user} ->
         conn
         |> put_flash(:info, "#{user.name} created!")
         |> redirect(to: user_path(conn, :index))
       {:error, changeset} ->
         render(conn, "new.html", changeset: changeset)
     end
   end

あんまり説明することはないですが、 ``conn`` からのパイプラインで作成後の ``template`` 用の処理を読んでる点くらいでしょうか。パイプラインが最大の特徴かもしれませんが・・・
また、 ``new.html.eex`` もエラーを表示するように変えます。

.. code-block:: ERB

   <h1>New User</h1>
   <%= if @changeset.action do %>
     <div class="alert alert-danger">
       <p>Oops, something went wrong! Please check the errors below.</p>
     </div>
   <% end %>
 
   <%= form_for @changeset, user_path(@conn, :create), fn f -> %>
     <div class="form-group">
       <%= text_input f, :name, placeholder: "Name", class: "form-control" %>
       <%= error_tag f, :name %>
     </div>
     <div class="form-group">
       <%= text_input f, :username, placeholder: "Username", class: "form-control" %>
       <%= error_tag f, :username %>
     </div>
     <div class="form-group">
       <%= password_input f, :password, placeholder: "Password", class: "form-control" %>
       <%= error_tag f, :password %>
     </div>
     <%= submit "Create User", class: "btn, btn-primary" %>
   <% end %>

``error_tag/2`` 関数は ``view`` の ``error_helpers.ex`` に定義されている関数です。

=========================
Changesetについて
=========================

このchapterの最後に ``changeset`` について触れられています。

.. code-block:: shell

   iex(1)> changeset = Rumbl.User.changeset(%Rumbl.User{username: "eric"})
   #Ecto.Changeset<action: nil, changes: %{},
    errors: [name: {"can't be blank", [validation: :required]}],
    data: #Rumbl.User<>, valid?: false>
   iex(2)> changeset
   #Ecto.Changeset<action: nil, changes: %{},
    errors: [name: {"can't be blank", [validation: :required]}],
    data: #Rumbl.User<>, valid?: false>
   iex(3)> import Ecto.Changeset
   Ecto.Changeset
   iex(4)> changeset.changes
   %{}
   iex(5)> changeset = put_change(changeset, :username, "ericmj")
   #Ecto.Changeset<action: nil, changes: %{username: "ericmj"},
    errors: [name: {"can't be blank", [validation: :required]}],
    data: #Rumbl.User<>, valid?: false>
   iex(6)> changeset.changes
   %{username: "ericmj"}
   iex(7)> get_change(changeset, :username)
   "ericmj"

これを見ると ``changeset`` はバリデーション以外にも変更をの追跡と保持を行っていることがわかります。

=========================
まとめ
=========================

簡単なDB操作を行いました。今回はテンプレート周りはおまけだったように思います。
何かしらフレームワーク触ったことあればそんなに違和感はなく使えると思います。
ずっと ``changeset`` が謎だったんですが、少し理解できたと思います。
基本的なところは結構網羅されてきたんじゃないかと思いますのでサクサク行きたいです。
