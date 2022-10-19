---
date: 2017-02-04 23:18
tags:
  - phoenix
  - elixir
  - programming
description: Programming Phoenixって本を読むその16
title: Programming Phoenix勉強その16
slug: programming-phoenix16
related_posts: programming-phoenix15
---


Programming Phoenix勉強その16
################################

その16です。 ``Channel`` の続きからですが、コメント管理するモデルの作成からです。

============================================
モデルの作成
============================================

いつものコマンドからモデルを作成&マイグレーションします。

.. code-block:: shell

   rumbl $ mix phoenix.gen.model Annotation annotations body:text at:integer user_id:references:users video_id:references:videos
   rumbl $ mix ecto.migrate

完了したら ``user.ex`` と ``video.ex`` に ``has_many :annotations, Rumbl.Annotation`` を追加しておきます。
作成したらモデルを使うようにしてやります。 ``video_channel.ex`` を以下のように変更します。

.. code-block:: Elixir

   defmodule Rumbl.VideoChannel do
     use Rumbl.Web, :channel
   
     def join("videos:" <> video_id, _params, socket) do
       {:ok, assign(socket, :video_id, String.to_integer(video_id))}
     end
 
     # 最初に入ってきてuserを取得後各関数に処理をディスパッチする
     def handle_in(event, params, socket) do
       user = Repo.get(Rumbl.User, socket.assigns.user_id)
       handle_in(event, params, user, socket)
     end
   
     def handle_in("new_annotation", params, user, socket) do
       changeset =
         user
         |> build_assoc(:annotations, video_id: socket.assigns.video_id)
         |> Rumbl.Annotation.changeset(params)
   
       case Repo.insert(changeset) do
         {:ok, annotation} ->
           # 接続しているクライアント全てにブロードキャストする
           # ユーザが任意のメッセージを送れないようにparamsを分解する
           broadcast! socket, "new_annotation", %{
             id: annotation.id,
             user: Rumbl.UserView.render("user.json", %{user: user}),
             body: annotation.body,
             at: annotation.at
           }
           {:reply, :ok, socket}
   
         {:error, changeset} ->
           {:reply, {:error, %{errors: changeset}}, socket}
       end
     end
   end

``handle_in/3`` 関数と ``handle_in/4`` 関数を追加しました。 ``user`` を必ず取得してから次の処理に移行するように
しています。

この中で ``UserVide.render`` 関数を使っているのでそちらも ``user_view.ex`` に実装します。

.. code-block:: Elixir

   defmodule Rumbl.UserView do
     use Rumbl.Web, :view
     alias Rumbl.User
   
     def first_name(%User{name: name}) do
       name
       |> String.split(" ")
       |> Enum.at(0)
     end
   
     def render("user.json", %{user: user}) do
       %{id: user.id, username: user.username}
     end
   end

``render`` 関数を追加しました。普通の ``render`` 関数は第一引数にテンプレート名を受けますが、
jsonを受けるようにして作りました。

============================================
コメントの時系列順表示
============================================

``annotation`` の永続化は行ったので、以下を行います。

- 永続化されたコメントを取り出して表示する処理
- クリックしたときに投稿した時間に動画を飛ばす処理

``video_channel.ex`` の ``join`` 関数を以下のように変更します。

.. code-block:: Elixir

   alias Rumbl.AnnotationView
 
   def join("videos:" <> video_id, _params, socket) do
     video_id = String.to_integer(video_id)
     video = Repo.get!(Rumbl.Video, video_id)
 
     annotations = Repo.all(
       # videoに紐づくannotationsを取得
       from a in assoc(video, :annotations),
         order_by: [asc: a.at, asc: a.id],
         limit: 200,
         preload: [:user]
     )
     
     resp = %{annotations: Phoenix.View.render_many(annotations, AnnotationView, "annotation.json")}
 
     # socket.assignsにvideo_idを保存
     {:ok, resp, assign(socket, :video_id, video_id)}
   end

接続直後にその ``video`` に関連する ``annotation`` を取得して送信しています。
``Rumbl.AnnotationView`` を使っているのでこれも実装します。

.. code-block:: Elixir

   defmodule Rumbl.AnnotationView do
     use Rumbl.Web, :view
   
     def render("annotation.json", %{annotation: ann}) do
       %{
         id: ann.id,
         body: ann.body,
         at: ann.at,
         user: render_one(ann.user, Rumbl.UserView, "user.json")
       }
     end
   end

``render_many`` や ``render_one`` 見たいな関数は 
`公式ドキュメント <https://hexdocs.pm/phoenix/Phoenix.View.html#functions>`_ を参考にすればわかると思います。

これに伴い、 ``join`` した時のクライアントサイドコードも変更しておく必要があります。

.. code-block:: JavaScript

   import Player from "./player"
   
   let Video = {
   ...
       onReady(videoId, socket) {
           let msgContainer = document.getElementById("msg-container");
           let msgInput = document.getElementById("msg-input");
           let postButton = document.getElementById("msg-submit");
           // トピックの識別
           let vidChannel = socket.channel("videos:" + videoId);
   
           postButton.addEventListener("click", e => {
               let payload = { body: msgInput.value, at: Player.getCurrentTime() };
               vidChannel.push("new_annotation", payload)
                   .receive("error", e => console.log(e));
               msgInput.value = "";
           });
   
           // サーバーからのプッシュイベントを受け取るイベントハンドラを設定
           vidChannel.on("new_annotation", (resp) => {
               this.renderAnnotation(msgContainer, resp);
           });
   
           msgContainer.addEventListener("click", e => {
               e.preventDefault();
               let seconds = e.target.getAttribute("data-seek") ||
                   e.target.parentNode.getAttribute("data-seek");
   
               if (!seconds) { return; }
   
               Player.seekTo(seconds);
           });
   
           // チャンネルへのjoin receiveで帰ってきたものを受け取る(OTPっぽい)
           vidChannel.join()
               .receive("ok", resp => {
                   this.scheduleMessages(msgContainer, resp.annotations)
               })
               .receive("error", reason => console.log("join failed", reason));
       },
   
       esc(str) {
           let div = document.createElement("div");
           div.appendChild(document.createTextNode(str));
           return div.innerHTML;
       },
   
       renderAnnotation(msgContainer, { user, body, at }) {
           let template = document.createElement("div");
   
           template.innerHTML = `
           <a href="#" data-seek="${this.esc(at)}">
               [${this.formatTime(at)}]
               <b>${this.esc(user.username)}</b>: ${this.esc(body)}
           </a>
           `;
   
           msgContainer.appendChild(template);
           msgContainer.scrollTop = msgContainer.scrollHeight;
       },
   
       scheduleMessages(msgContainer, annotations) {
           setTimeout(() => {
               let ctime = Player.getCurrentTime();
               let remaining = this.renderAtTime(annotations, ctime, msgContainer);
               this.scheduleMessages(msgContainer, remaining);
           }, 1000);
       },
   
       renderAtTime(annotations, seconds, msgContainer) {
           return annotations.filter(ann => {
               if (ann.at > seconds) {
                   // コメントした時間以降で無ければ表示しない
                   return true;
               } else {
                   // 表示してリストから除外する
                   this.renderAnnotation(msgContainer, ann);
                   return false;
               }
           });
       },
   
       formatTime(at) {
           let date = new Date(null);
           date.setSeconds(at / 1000);
           return date.toISOString().substr(14, 5);
       }
   }
   
   export default Video;

何かいっぱい追加しましたが、大したことはしていないです。

- ``join`` 時にリストで受け取るコメント一覧を保持
- ``renderAtTime`` 関数で投稿時間を過ぎていたらレンダリングする
- コメントをクリックしたら時間のところに動画をシークするイベント追加

こんなところでしょうか。

============================================
切断処理の実装
============================================

切断処理を適切にハンドリングするようにします。
現状では切断後そのまま再接続すると同じコメントがかぶってしまったりするケースがあります。
これを回避するために最後に参照した ``annotation`` のidを保持しておいて、再接続後はそれ以降のものを取得するようにします。

はじめにクライアント側で最後に取得したコメントのIDを保持するように変更します。 ``video.js`` を修正します。

.. code-block:: JavaScript

   ...
   // サーバーからのプッシュイベントを受け取るイベントハンドラを設定
   vidChannel.on("new_annotation", (resp) => {
       // 投稿したものが最新のIDなので保持する
       vidChannel.params.last_seen_id = resp.id;
       this.renderAnnotation(msgContainer, resp);
   });
   ...
   // チャンネルへのjoin receiveで帰ってきたものを受け取る(OTPっぽい)
   vidChannel.join()
       .receive("ok", resp => {
           let ids = resp.annotations.map(ann => ann.id);
           if (ids.length > 0) {
               // 再生したコメントの最後のものを取得
               vidChannel.params.last_seen_id = Math.max(...ids);
           }
           console.log(vidChannel.params.last_seen_id);
           this.scheduleMessages(msgContainer, resp.annotations)
       })
       .receive("error", reason => console.log("join failed", reason));

最後に取得したコメントIDを ``last_seen_id`` を ``params`` のパラメータとして保持します。
``vidChannel.params`` は最初から用意されており、自動でサーバー側にも送信されるパラメータです。

``last_seen_id`` を使うように ``video_channel.ex`` の ``join`` 関数を変更します。

.. code-block:: Elixir

   def join("videos:" <> video_id, params, socket) do
     last_seen_id = params["last_seen_id"] || 0
     video_id = String.to_integer(video_id)
     video = Repo.get!(Rumbl.Video, video_id)
 
     annotations = Repo.all(
       # videoに紐づくannotationsを取得
       from a in assoc(video, :annotations),
         where: a.id > ^last_seen_id,
         order_by: [asc: a.at, asc: a.id],
         limit: 200,
         preload: [:user]
     )
     
     resp = %{annotations: Phoenix.View.render_many(annotations, AnnotationView, "annotation.json")}
 
     {:ok, resp, assign(socket, :video_id, video_id)}
   end

``join`` 関数内では、 ``params`` を引数で受け取り ``Map`` などのように使えます。
但し、パラメータが渡されていない場合は ``nil`` になるのでチェックを掛けています。

これで切断後の再接続用処理が実装出来ました。

============================================
まとめ
============================================

- サーバー側とクライアント側で任意のパラメータを共有するときは ``params`` を使う

何か新しいことがあったというよりは今まで習ったものを ``JavaScript`` とか ``Elixir`` から上手いこと使う感じでした。
