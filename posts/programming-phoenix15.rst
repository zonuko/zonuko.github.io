---
date: 2017-02-03 00:18
tags:
  - phoenix
  - elixir
  - programming
description: Programming Phoenixって本を読むその15
title: Programming Phoenix勉強その15
slug: programming-phoenix15
related_posts: programming-phoenix14
---


Programming Phoenix勉強その15
################################

その15です。ここからChapter10の ``Channel`` です。Phoenixの目玉機能の一つな気もするので楽しみです。

============================================
Channelについて
============================================

- ステートを持つ双方向通信である

  - ステートフルなので ``Cookie`` などを意識しなくて良い
- トピックと呼ばれる単位で各会話は管理される
- 各々の会話はプロセスで管理され、一つがバグっても他に影響を与えないし、並列性も持つ
- クライアント側はES6(ES2015)で記述する
- 実装するにあたりクライアントとサーバーで以下3つを意識する

  - 接続と切断
  - メッセージの送信
  - メッセージの受信

============================================
クライアントサイドの実装
============================================

というわけで、ES6でクライアントサイドから実装していきます。まず ``video.js`` を作成します。

.. code-block:: JavaScript

   import Player from "./player"
   
   let Video = {
       init(socket, element) {
           if (!element) { return; }
           let playerId = element.getAttribute("data-player-id");
           let videoId = element.getAttribute("data-id");
           socket.connect()
           Player.init(element.id, playerId, () => {
               this.onReady(videoId, socket);
           });
       },
   
       onReady(videoId, socket) {
           let msgContainer = document.getElementById("msg-container");
           let msgInput = document.getElementById("msg-input");
           let postButton = document.getElementById("msg-submit");
           // トピックの識別
           let voidChannel = socket.channel("videos:" + videoId);
           // TODO: join the vidChannel
       }
   }
   export default Video;

``player`` の ``import`` をこっちに移設しています。また、 ``init`` メソッドと ``onReady`` メソッドを定義しています。
``onReady`` はコールバックとして使っているようです。
コメントにあるようにトピックの識別子は ``videoId`` としています。

``app.js`` を上の実装に合わせて変えておきます。 ``Player`` を作成していた部分に変わって ``Video`` の利用にします。

.. code-block:: JavaScript

   import socket from "./socket";
   import Video from "./video";
   Video.init(socket, document.getElementById("video"));

デフォルトで用意されている ``socket.js`` のインポートも行っています。
このファイルについては後で触るようです。

通常のリクエストと ``socket`` のデータの流れの違いについても触れられています。
前の章で見たように通常のアクセスではデータは ``conn`` という形で各パイプラインを流れて、
その中で変換されていきます。 ``conn`` は新しい接続ごとに新しいものが作られて使われます。

一方 ``socket`` の方ではステートフルなためソケットの寿命まで一つの接続が変換され続けます。

============================================
socket.jsの変更
============================================

最初のソケットを作成します。 ``socket.js`` の中身を変更して実装していきます。

.. code-block:: JavaScript

   import { Socket } from "phoenix"
   
   let socket = new Socket("/socket", {
       params: { token: window.userToken },
       // バッククオートで囲んだものがテンプレートリテラルとして値を文字に埋め込める
       logger: (kind, msg, data) => { console.log(`${kind}: ${msg}`, data); }
   });
   
   export default socket

余計な部分を消してしまって問題ないです。ログをコンソールに出すように変更しただけです。

``Phoenix`` 側でのソケットのエンドポイントは ``endpoint.ex`` に記述されています。

.. code-block:: Elixir

   socket "/socket", Rumbl.UserSocket

============================================
サーバーサイドの実装
============================================

``Rumbl.UserSocket`` がエントリポイントになっていることがわかったので中身を見てみます。
``channel/user_socket.ex`` です。

.. code-block:: Elixir

   defmodule Rumbl.UserSocket do
     use Phoenix.Socket
   
     transport :websocket, Phoenix.Transports.WebSocket
     # transport :longpoll, Phoenix.Transports.LongPoll
 
     def connect(_params, socket) do
       {:ok, socket}
     end
   
     def id(_socket), do: nil
   end

余計なコメントは消してます。

- ``transport`` のところをコメントと合わせて見るとわかるように、二種類サポートされているようです。
  通常の ``websocket`` と ``longpoll`` のロングポーリングです。
  これは接続方法が抽象化され、他の部分の処理は同じで良いということです。
- ``connect/2`` 関数はユーザの接続制御に用いられる。現在は全てのユーザが接続可能。認証は後で追加するらしい。
- ``id/1`` 関数はソケットの識別を行っています。 ``nil`` なので全ユーザが匿名です。

実際に実装していきます。まず ``user_socket.ex`` に以下を追加します。

.. code-block:: Elixir

   ## Channels
   channel "videos:*", Rumbl.VideoChannel

``Phoenix`` ではトピックはリソース名（ ``:videos`` とか）でサブトピックは付随するIDになるようです。

上記に書いた通り、 ``VideoChannel`` にディスパッチしているのでこれを実装していきます。
``channels/video_channel.ex`` を実装します。

.. code-block:: Elixir

   defmodule Rumbl.VideoChannel do
     use Rumbl.Web, :channel
   
     def join("videos:" <> video_id, _params, socket) do
       {:ok, assign(socket, :video_id, String.to_integer(video_id))}
     end
   end

``join/3`` コールバック関数を作りました。（コールバックという呼び方はOTPに習っているようです。）

引数に与えられている ``socket`` は接続されている間状態を保持します。
なので、 ``assign`` などでデータを追加するとそれもずっと保持されて参照可能です。

クライアント側でも ``join`` 出来るようにします。 ``video.js`` を変更します。

.. code-block:: JavaScript

   onReady(videoId, socket) {
         let msgContainer = document.getElementById("msg-container");
         let msgInput = document.getElementById("msg-input");
         let postButton = document.getElementById("msg-submit");
         // トピックの識別
         let vidChannel = socket.channel("videos:" + videoId);
         // チャンネルへのjoin receiveで帰ってきたものを受け取る(OTPっぽい)
         vidChannel.join()
             .receive("ok", resp => console.log("joined the video channel", resp))
             .receive("error", reason => console.log("join failed", reason));
     }

抜粋しました。クライアントサイドでサーバーサイドの関数呼んでるような見た目です。
また、 ``receive`` はOTPでよく出てくるメッセージを受信するやつと同じっぽい感じで使っているみたいです。

次に、試しに5秒毎にクライアントに通知を投げる処理を追加してみます。
``video_channel.ex`` を以下のように実装します。

.. code-block:: Elixir

   defmodule Rumbl.VideoChannel do
     use Rumbl.Web, :channel
   
     def join("videos:" <> video_id, _params, socket) do
       # 5秒ごとにクライアントにメッセージを送る
       # send_interval/2関数は最終的にはsend_interval(Time, self(), Message)という形で呼び出される
       :timer.send_interval(5_000, :ping)
       # socket.assignsにvideo_idを保存
       {:ok, assign(socket, :video_id, String.to_integer(video_id))}
     end
   
     # OTPのコールバックhandle_castやhandle_callの仲間
     # castやcallで処理される以外のメッセージを処理するらしい
     def handle_info(:ping, socket) do
       count = socket.assigns[:count] || 1
       push socket, "ping", %{count: count}
   
       {:noreply, assign(socket, :count, count + 1)}
     end
   end

コメントに書いてあるように、 ``join`` されると5秒ごとに自分自身にメッセージを投げて ``handle_info`` コールバックで受け取っています。
``handle_info`` では ``socket`` に追加された ``count`` をインクリメントしていっているだけです。
``push`` されるとクライアント側に通知が行くようです。

============================================
リアルタイムアノテーションの実装
============================================

基本的なところはわかったので動画にリアルタイムコメントを付けられるようにします。
ちなみに `ここ <http://www.weblio.jp/content/%E3%82%A2%E3%83%8E%E3%83%86%E3%83%BC%E3%82%B7%E3%83%A7%E3%83%B3>`_
によるとYouTubeの動画へのコメントとかをアノテーションって呼ぶときもあるらしいですよ。

``video.js`` を変更します。

.. code-block:: JavaScript

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
   
           // チャンネルへのjoin receiveで帰ってきたものを受け取る(OTPっぽい)
           vidChannel.join()
               .receive("ok", resp => console.log("joined the video channel", resp))
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
               <b>${this.esc(user.username)}</b>: ${this.esc(body)}
           </a>
           `;
   
           msgContainer.appendChild(template);
           msgContainer.scrollTop = msgContainer.scrollHeight;
       }
   }

サーバーからのプッシュイベントを受け取る用に設定したのと、受け取った物をレンダリングする関数を作成しました。
また、 ``esc`` 関数でXSS対策を行っています。

``count`` のやり取りからコメントのやり取りに変更したのでサーバー側も合わせて変更します。

.. code-block:: Elixir

   defmodule Rumbl.VideoChannel do
     use Rumbl.Web, :channel
   
     def join("videos:" <> video_id, _params, socket) do
       {:ok, socket}
     end
   
     # クライアントから直接送信された時に受け取るコールバック
     def handle_in("new_annotation", params, socket) do
       # 接続しているクライアント全てにブロードキャストする
       # ユーザが任意のメッセージを送れないようにparamsを分解する
       broadcast! socket, "new_annotation", %{
         user: %{username: "anon"},
         body: params["body"],
         at: params["at"]
       }
   
       {:reply, :ok, socket}
     end
   end

``join`` 関数をもとに戻したのと ``handle_in/3`` 関数を新たに追加しました。
``handle_in`` では ``Map.put`` とかでメッセージを作っていないのはセキュリティ対策のようです。
メッセージはユーザから任意で入力されるので ``params`` をバラして好き勝手入れられない様にしています。

============================================
認証の追加
============================================

誰が送ったメッセージか知りたいので認証を行います。
普通のアプリケーションはセッションでの認証が主ですが、 ``websocket`` では接続が長く続くため、
トークン認証で行います。まずテンプレートにトークンを埋め込みます。

.. code-block:: ERB

   ...
   </div> <!-- /container -->
   <!-- websocket用ユーザトークンの埋め込み Rumbl.Authでの認証が通っていることが条件 -->
   <script>window.userToken = "<%= assigns[:user_token] %>"</script>
   <script src="<%= static_path(@conn, "/js/app.js") %>"></script>
   ...

``user_token`` を ``assign`` するように ``auth.ex`` を変更します。

.. code-block:: Elixir

   defmodule Rumbl.Auth do
     ...
     def call(conn, repo) do
       user_id = get_session(conn, :user_id)
       cond do
         user = conn.assigns[:current_user] ->
           put_current_user(conn, user) # 変更
         user = user_id && repo.get(Rumbl.User, user_id) ->
           put_current_user(conn, user) # 変更
         true ->
           assign(conn, :current_user, nil)
       end
     end
   
     def login(conn, user) do
       conn
       |> put_current_user(user) # 変更
       |> put_session(:user_id, user.id)
       |> configure_session(renew: true) 
     end
     ...
     # 追加
     defp put_current_user(conn, user) do
       # 第二引数はsalt
       token = Phoenix.Token.sign(conn, "user socket", user.id)
   
       conn
       |> assign(:current_user, user)
       |> assign(:user_token, token) # トークンを突っ込んでapp.html.eexより使う
     end
   end

特に不思議なところはなくて、 ``Phoenix.Token.sign`` を使ってトークンを作っているだけです。

``user_socket.ex`` を変更してセッションに割り当てられた ``:user_token`` から ``user_id`` を判別し、
``socket`` に割り当てるようにします。

.. code-block:: Elixir

   ...
     # 2週間有効
     @max_age 2 * 7 * 24 * 60 * 60
   
     def connect(%{"token" => token}, socket) do
       # 第二引数はsalt
       case Phoenix.Token.verify(socket, "user socket", token, max_age: @max_age) do
         {:ok, user_id} ->
           {:ok, assign(socket, :user_id, user_id)}
         {:error, _reason} ->
           :error
       end
     end
   
     def connect(_params, _socket), do: :error
   
     def id(socket), do: "user_socket:#{socket.assigns.user_id}"
   end

これも余り不思議なところはなくて、 ``Phoenix.Token.verify`` を使ってトークンから ``user_id`` を取っているだけです。
これでログインしていなければコメントが投稿できなくなりました。

============================
まとめ
============================

- ``Channel`` はサーバーとクライアントの双方向リアルタイム通信を行う。
- ``Channel`` はOTPの上に成り立っていて、コールバック関数などもそれに従っている。
- ``Phoenix`` には最初からクライアント側の ``weboscket`` 用ライブラリも用意されている。
- 接続が長期間続くため、認証はトークンを利用して行う。

``websocket`` その1でした。今まで余りやったことがないことをしている感があって面白いです。
次は投稿されたコメントの永続化からです。
