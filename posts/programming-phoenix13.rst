---
date: 2017-01-30 23:30
tags:
  - phoenix
  - elixir
  - programming
description: Programming Phoenixって本を読むその13
title: Programming Phoenix勉強その13
slug: programming-phoenix13
related_posts: programming-phoenix12
---

Programming Phoenix勉強その13
################################

その13です。ここからPart2です。ここから機能をちゃんと整備します。

- ビデオに対してリアルタイムコメントを付けられるように
- ビデオを再生可能に

をやっていくようです。はじめにビデオを再生可能にしていきます。


============================================
視聴用ページ作成
============================================

投稿されたビデオを見るためのページを作ります。いつものを作るのでソースのみ提示します。
``app.html.eex`` に投稿一覧表示用メニューを付けます。

.. code-block:: ERB

   ...
   <body>
     <div class="container">
       <header class="header">
         <ol class="breadcrumb text-right">
           <!-- assignsで突っ込んだものが使えている -->
           <%= if @current_user do %>
             <li><%= @current_user.username %></li>
             <li><%= link "My Videos", to: video_path(@conn, :index) %></li>
             <li>
   ...

``watch_controller.ex`` を作成します。

.. code-block:: Elixir

   defmodule Rumbl.WatchController do
     use Rumbl.Web, :controller
     alias Rumbl.Video
 
     def show(conn, %{"id" => id}) do
       video = Repo.get!(Video, id)
       render conn, "show.html", video: video
     end
   end

``wathc/show.html.eex`` を作成します。コメント入力欄がある唯のページです。

.. code-block:: ERB

   <h2><%= @video.title %></h2>
   <div class="row">
     <div class="col-sm-7">
       <%= content_tag :div, id: "video",
             data: [id: @video.id, player_id: player_id(@video)] do %>
       <% end %>
     </div>
     <div class="col-sm-5">
       <div class="panel panel-default">
         <div class="panel-heading">
           <h3 class="panel-title">Annotations</h3>
         </div>
         <div id="msg-container" class="panel-body annotations">
         </div>
         <div class="panel-footer">
           <textarea id="msg-input"
                     rows="3"
                     class="form-control"
                     placeholder="Comment...">
           </textarea>
           <button id="msg-submit" class="btn btn-primary form-control"
               type="submit">
             Post
           </button>
         </div>
       </div>
     </div>
   </div>

上記テンプレート内で ``player_id/1`` という関数を使っているので ``watch_view.ex`` を実装します。

.. code-block:: Elixir

   defmodule Rumbl.WatchView do
     use Rumbl.Web, :view
 
     def player_id(video) do
       ~r{^.*(?:youtu\.be/|\w+/|v=)(?<id>[^#&?]*)}
       |> Regex.named_captures(video.url)
       |> get_in(["id"])
     end
   end

正規表現を使って投稿されたYouTubeのURLに対してパラメータ部分のみを取り出しています。
``router.ex`` に ``/`` スコープに ``get "/watch/:id", WatchController, :show`` を追加しておきます。

最後に、ビデオ一覧画面にウォッチ画面へのリンクボタンを作成します。 ``video/index.html.eex`` に以下を追加します。

.. code-block:: ERB

   ...
   <tbody>
     <%= for video <- @videos do %>
       <tr>
         <td><%= video.user_id %></td>
         <td><%= video.url %></td>
         <td><%= video.title %></td>
         <td><%= video.description %></td>

         <td class="text-right">
           <%= link "Watch", to: watch_path(@conn, :show, video), class: "btn btn-default btn-xs" %>
   ...

これで準備は完了です。次からJavaScript側のコードを作成します。

============================================
視聴用ページ作成
============================================

最初にPhoenixでのJavaScriptのビルド周りについて触れられています。

- ビルドツールは ``Brunch`` がデフォルト
- ``Brunch`` の設定はデフォルトでES6になっている
- ``Brunch`` を使わないように変えることも可能。プロジェクト作成時に ``--no-Brunch`` オプションを与えると最初から除ける。
- ``web/static/js`` 以下にあるファイルをすべて ``app.js`` にまとめる
- staticファイルの読み込みは ``static_path(@conn, "/js/app.js")`` で行う
- モジュールシステムを利用しないライブラリは ``web/static/vendor`` に追加する

  - 公式ドキュメントによると ``bower`` で入れたものはこっちに配備されるっぽい？

というわけでJavaScript周りを実装します。 ``static/js/player.js`` を以下の通り実装します。

.. code-block:: JavaScript

   let Player = {
       player: null,
 
       init(domId, player, onReadby) {
           window.onYouTubeIframeAPIReady = () => {
               this.onIframeReady(domId, player, onReadby);
           };
           let youtubeScriptTag = document.createElement("script");
           // APIの読み込み APIが読み込まれるとonYouTubeIframeAPIReady関数が自動で呼ばれる
           youtubeScriptTag.src = "//www.youtube.com/iframe_api";
           document.head.appendChild(youtubeScriptTag);
       },
 
       onIframeReady(domId, playerId, onReady) {
           this.player = new YT.Player(domId, {
               height: "360",
               width: "420",
               videoId: playerId,
               events: {
                   "onReady": (event => onReady(event)),
                   "onStateChange": (event => this.onPlayerStateChange(event))
               }
           });
       },
 
       onPlayerStateChange(event) {},
       getCurrentTime() { return Math.floor(this.player.getCurrentTime() * 1000); },
       seekTo(millsec) { return this.player.seekTo(millsec / 1000); }
   };
   export default Player;

YouTubeのAPIを読み込んでいます。本筋から外れてしまうので割愛します。文法がES2015形式なので昔のJavaScriptとはちょっと変わっています。

ソースを作っただけでは読み込んでくれないので ``static/js/app.js`` を以下のように変更します。

.. code-block:: JavaScript

   ...
   import Player from "./player";
   let video = document.getElementById("video");
   if(video) {
       Player.init(video.id, video.getAttribute("data-player-id"), () => {
           console.log("player ready!");
       });
   }

``import`` 文もES2015の文法だったと記憶してます。これも特に言うことはありません。

こんな感じで実装して実行したあと、 ``priv/static/js/app.js`` を見に行くとソースがまとめられていることがわかります。
抜粋して載せてみます。

.. code-block:: JavaScript

   var Player = {
       player: null,
 
       init: function init(domId, plyerId, onReadby) {
           var _this = this;
 
           window.onYouTubeIframeAPIReady = function () {
               _this.onIframeReady(domId, playerId, onReadby);
           };
           var youtubeScriptTag = document.createElement("script");
           // APIの読み込み APIが読み込まれるとonYouTubeIframeAPIReady関数が自動で呼ばれる
           youtubeScriptTag.src = "//www.youtube.com/iframe_api";
           document.head.appendChild(youtubeScriptTag);
       },
       onIframeReady: function onIframeReady(domId, playerId, _onReady) {
           var _this2 = this;
 
           this.player = new YT.Player(domId, {
               height: "360",
               width: "420",
               videoId: playerId,
               events: {
                   "onReady": function onReady(event) {
                       return _onReady(event);
                   },
                   "onStateChange": function onStateChange(event) {
                       return _this2.onPlayerStateChange(event);
                   }
               }
           });
       },
       onPlayerStateChange: function onPlayerStateChange(event) {},
       getCurrentTime: function getCurrentTime() {
           return Math.floor(this.player.getCurrentTime() * 1000);
       },
       seekTo: function seekTo(millsec) {
           return this.player.seekTo(millsec / 1000);
       }
   };
   exports.default = Player;
   });

============================================
スラッグの追加
============================================

各ビデオを任意のURLでアクセス出来るように ``Slug`` を付けます。

``mix ecto.gen.migration add_slug_to_video`` を実行後以下のようにマイグレーションファイルを変更します。

.. code-block:: Elixir

   defmodule Rumbl.Repo.Migrations.AddSlugToVideo do
     use Ecto.Migration
   
     def change do
       alter table(:videos) do
         add :slug, :string
       end
     end
   end

出来たらマイグレーションを実行後、 ``video.ex`` で新たに追加された ``slug`` カラムを使うようにします。

.. code-block:: Elixir

   defmodule Rumbl.Video do
     use Rumbl.Web, :model
   
     schema "videos" do
       field :url, :string
       field :title, :string
       field :description, :string
       field :slug, :string # 追加
       belongs_to :user, Rumbl.User
   
       belongs_to :category, Rumbl.Category
   
       timestamps()
     end
   
     @doc """
     Builds a changeset based on the `struct` and `params`.
     """
     def changeset(struct, params \\ %{}) do
       struct
       |> cast(params, [:url, :title, :description, :category_id])
       |> validate_required([:url, :title, :description])
       |> slugify_title() # タイトルをSlugに変換
       |> assoc_constraint(:category)
     end
   
     defp slugify_title(changeset) do
       # タイトルからSlugを作成する
       # changesetを弄るだけで変更予定データの追加などが出来ている
       if title = get_change(changeset, :title) do
         put_change(changeset, :slug, slugify(title))
       else
         changeset
       end
     end
   
     defp slugify(str) do
       str
       |> String.downcase()
       |> String.replace(~r/[^\w-]+/u, "-")
     end
   end

``get_change`` や ``put_change`` などを使うことで、変更が ``changeset`` の中だけで収まってくれています。

============================================
まとめ
============================================

- ``JavaScript`` のビルドツールのデフォルトは ``Brunch``
- ``JavaScript`` の書式はデフォルトでES2015(ES6)形式
- static系統のファイルは ``web/static/*`` に色々おいていくとよしなにしてくれる

全体的にクライアントサイドって感じでした。
