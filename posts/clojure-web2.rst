---
date: 2018-05-15 23:00
tags:
  - clojure
  - programming
description: ClojureでWebアプリ作ってみたつづき
title: ClojureでWebアプリ続き(WebSocketとチャット)
slug: clojure-web2
related_posts: clojure-web
---

ClojureでWebアプリ続き(WebSocketとチャット)
#############################################

単発で終わったと見せかけて続きです。

`WebSocket` 使ってチャットでも作ってみます。
使うものは `sente <https://github.com/ptaoussanis/sente>`_ です。単純にググったら最初の方に出てきたので使ってみます。
とりあえずシンプルに以下が目標です。

- チャットルームとかは作らずに全員同じチャットルーム

  - 要するにサーバーからの通知は必ずブロードキャストで行きます。

- テーブル作ってそこに保存すること(メッセージと、ログインしている場合は発信者のID)
- リプライ機能とかは作らない

リポジトリなどは前回とおんなじ

============================================
導入
============================================

以下の依存関係をを `project.clj` に追加します。

- `[gravatar "1.1.0"]`

  - チャット画面のアバター表示用別になくても良い

- `[http-kit "2.2.0"]`

  - `sente` のサンプルによく使われていたので `jetty` から置き換え
    
- `[com.taoensso/sente "1.12.0"]`

  - `sente` 本体

とりあえずこんなもんです。

============================================
サーバー側の実装
============================================

適当にネームスペース掘ります。今回は `earth-clj.socket` でフォルダ直下にしてしまいました。

まずは `sente` のリポジトリのREADMEに書いてあるように実装します。

.. code-block:: Clojure

   (ns earth-clj.socket
     (:require [taoensso.sente :as sente]
               [clojure.core.async :refer [go-loop <!]]
               [compojure.core :refer [defroutes context GET POST]]
               [earth-clj.db.message :as message]
               [taoensso.timbre    :as timbre :refer (tracef debugf infof warnf errorf)]
               [taoensso.sente.server-adapters.http-kit :refer (get-sch-adapter)]))
   
   ;; sente用の設定 要確認
   (let [{:keys [ch-recv send-fn connected-uids
                 ajax-post-fn ajax-get-or-ws-handshake-fn]}
         (sente/make-channel-socket! (get-sch-adapter) {})]
     (def ring-ajax-post ajax-post-fn)
     (def ring-ajax-get-or-ws-handshake ajax-get-or-ws-handshake-fn)
     (def ch-chsk ch-recv) ; ChannelSocket's receive channel
     (def chsk-send! send-fn) ; ChannelSocket's send API fn
     (def connected-uids connected-uids)) ; Watchable, read-only atom
   
   (defroutes socket-routes
              ;; <other stuff>
              ;;; Add these 2 entries: --->
              (GET  "/chsk" req (ring-ajax-get-or-ws-handshake req))
              (POST "/chsk" req (ring-ajax-post req)))

`WebSocket` の受信/発信用の `Var` 定義と接続とかに使われる `routes` の設定がされるっぽいです。
正直そんなに理解してないです。 `connected-uids` がコネクションに対するワンタイムトークンみたいになってるのかな？って程度です。

ただ、 `ch-chsk` が `core.async` の `channel` になっていることだけ注意が必要かもです。
`println` とかすると `clojure.core.async.impl.channels.ManyToManyChannel` のインスタンスであることがわかったりします。
`ManyToMany` があるなら他にもあるんじゃないかとか、 `core.async` 自体も理解してないのでココらへんのオブジェクトが何なのかは追々・・・

サーバー側のイベント
================================

サーバー側のイベント処理を書いていきます。

.. code-block:: Clojure

   ;; 全UIDに対してメッセージをブロードキャストする
   ;; TODO: UIDの扱い方がよくわからない
   (defn msgs-broadcast []
     (debugf "BroadCastMsgs")
     (doseq [uid (:any @connected-uids)]
       (chsk-send! uid [:chat/msgs (message/all-messages)])))
   
   ;; イベントを送られてきたIDによって分岐するマルチメソッド
   (defmulti -event-msg-handler
             "Multimethod to handle Sente `event-msg`s"
             :id)
   
   ;; :idが何にもマッチしなかった場合
   (defmethod -event-msg-handler
     :default
     [{:as ev-msg :keys [event id ?data ring-req ?reply-fn send-fn]}]
     (let [session (:session ring-req)
           uid     (:uid     session)]
       (debugf "Unhandled event: %s" event)
       (when ?reply-fn
         (?reply-fn {:umatched-event-as-echoed-from-from-server event})))) 
   ;; 初期化処理
   (defmethod -event-msg-handler
     :chat/init
     [{:as ev-msg :keys [event id ?data ring-req ?reply-fn send-fn]}]
     (let [session (:session ring-req)
           uid     (:uid     session)]
       (debugf "Init event: %s" event)
       (when ?reply-fn
         (?reply-fn (message/all-messages)))))
   ;; チャットメッセージ投稿 
   ;; DBにインサート後ブロードキャストを行う
   (defmethod -event-msg-handler
     :chat/post
     [{:as ev-msg :keys [event id ?data ring-req ?reply-fn send-fn]}]
     (message/add-messages (get-in ring-req [:session :identity]) ?data)
     (msgs-broadcast))
   
   ;; イベントハンドラ発火元関数
   (defn event-msg-handler
     "Wraps `-event-msg-handler` with logging, error catching, etc."
     [{:as ev-msg :keys [id ?data event]}]
     (-event-msg-handler ev-msg) ; Handle event-msgs on a single thread
     ;; Handle event-msgs on a thread pool
     #_(future (-event-msg-handler ev-msg)))
   
   ;; コネクションを開始する関数群
   (defonce router_ (atom nil))
   (defn stop-router! [] (when-let [stop-f @router_] (stop-f)))
   (defn start-router! []
     (stop-router!)
     (reset! router_
             ;; 実際にはgo-loopに変換される。go-loopにしても似たようなものが取得できる
             ;; 実際にドキュメントでは熟練者ならそのようにするような記載有り
             (sente/start-server-chsk-router!
              ch-chsk event-msg-handler))) ;; イベントが来るたびにevent-msg-handlerが呼ばれる


DBへのインサート処理とか、ページレンダリングの部分とか `earth-clj.core` での初期起動とかは面倒なので割愛です。

ほぼほぼ `公式サンプル <https://github.com/ptaoussanis/sente/tree/master/example-project>`_ 丸パクリですが、自分で幾つかイベント追加してます。
マルチメソッドによって `:id` の値で分岐してるので、初期化用のメソッドとメッセージ投稿用のメソッドを追加してます。

また、コメントにもありますが、 `sente/start-server-chsk-router!` の実態は `go-loop` のようです。
実際にソース見てないので、 `ドキュメント頼り <http://ptaoussanis.github.io/sente/taoensso.sente.html#var-start-server-chsk-router.21>`_ ですが、
お試しで以下のようなコード書いた感じは大体同じレスポンスが取れるのでまぁ間違ってないのかなと。

.. code-block:: Clojure

   (go-loop []
    (when-let [data (<! ch-chsk)] 
      (println data)
      (recur)))  

以下みたいな感じ

.. code-block:: Clojure

   {:?reply-fn nil, :ch-recv #object[clojure.core.async.impl.channels.ManyToManyChannel 0x1e6dc10e "clojure.core.async.impl.channels.ManyToManyChannel@1e6dc10e"], :client-id "48eafbcd-f0c2-441a-9129-05278e039c97", :connected-uids #atom[{:ws #{:taoensso.sente/nil-uid}, :ajax #{}, :any #{:taoensso.sente/nil-uid}} 0x77ce4d53], :uid :taoensso.sente/nil-uid, :event [:chat/post "bbb"], :id :chat/post, :ring-req {:identity 1, :cookies {"io" {:value "2uQMNqiEQ0OUNAqGAAAD"}, "ring-session" {:value "9b0e2ba2-6918-459f-8352-3b6bfe9251f5"}}, :remote-addr "0:0:0:0:0:0:0:1", :params {:client-id "48eafbcd-f0c2-441a-9129-05278e039c97"}, :flash nil, :route-params {}, :headers {"origin" "http://localhost:4000", "host" "localhost:4000", "upgrade" "websocket", "user-agent" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.139 Safari/537.36", "cookie" "io=2uQMNqiEQ0OUNAqGAAAD; ring-session=9b0e2ba2-6918-459f-8352-3b6bfe9251f5", "connection" "Upgrade", "pragma" "no-cache", "sec-websocket-key" "H3cJYBZ1veyIIpl09QkvVA==", "accept-language" "ja,en-US;q=0.9,en;q=0.8,de;q=0.7,zh-CN;q=0.6,zh;q=0.5,fr;q=0.4,zh-TW;q=0.3", "sec-websocket-version" "13", "accept-encoding" "gzip, deflate, br", "sec-websocket-extensions" "permessage-deflate; client_max_window_bits", "cache-control" "no-cache"}, :async-channel #object[org.httpkit.server.AsyncChannel 0x79821c77 "/0:0:0:0:0:0:0:1:4000<->/0:0:0:0:0:0:0:1:51664"], :server-port 4000, :content-length 0, :form-params {}, :compojure/route [:get "/chsk"], :websocket? true, :session/key "9b0e2ba2-6918-459f-8352-3b6bfe9251f5", :query-params {"client-id" "48eafbcd-f0c2-441a-9129-05278e039c97"}, :content-type nil, :character-encoding "utf8", :uri "/chsk", :server-name "localhost", :query-string "client-id=48eafbcd-f0c2-441a-9129-05278e039c97", :body nil, :multipart-params {}, :scheme :http, :request-method :get, :session {:identity 1, :ring.middleware.anti-forgery/anti-forgery-token "NmfuFYMg+lHHS2opYqxkSPzoxDP0sGd6Hr0Xa2AWq4E3lDY1tfTTi/G+wQAS62RvHo0hUFodvQzXsyhF"}}, :?data "bbb", :send-fn #function[taoensso.sente/make-channel-socket-server!/send-fn--23743]}

============================================
クライアント側の実装
============================================

基本的に `ClojureScript` で実装することになります。
サーバー側と似たような感じで、 `earth-cljs.socket` ネームスペースとしました。

初期設定もサーバーと同じようにREADMEに書いてある物そのままです。

.. code-block:: Clojure

   (ns earth-cljs.socket
     (:require-macros [cljs.core.async.macros :as asyncm :refer (go go-loop)])
     (:require [cljs.core.async :as async :refer (<! >! put! chan)]
               [earth-cljs.util :as util :refer ($)]
               [taoensso.timbre :as timbre :refer-macros (tracef debugf infof warnf errorf)]
               [taoensso.encore :as encore :refer-macros (have have?)]
               [goog.string :as gstring]
               [gravatar.core :as gr]
               [taoensso.sente  :as sente :refer (cb-success?)]))
   
   ;;; Add this: --->
   (let [{:keys [chsk ch-recv send-fn state]}
         (sente/make-channel-socket! "/chsk" ; Note the same path as before
                                     {:type :auto})] ; e/o #{:auto :ajax :ws}
     (def chsk chsk)
     (def ch-chsk ch-recv) ; ChannelSocket's receive channel
     (def chsk-send! send-fn) ; ChannelSocket's send API fn
     (def chsk-state state)) ; Watchable, read-only atom

中身もコードの意味もほとんどサーバー側と同じでちょっと感動します。
ちなみに恥ずかしい限りですが `sente` の中身覗いて `cljc` の存在を知りました。


描画用の関数と初期化用関数
===============================

DOM生成用関数とアクセス時に初期データを取ってくる関数を定義してます。

.. code-block:: Clojure

   (defn- update-msgs [data]
     (let [output-el ($ "comment-container")]
       (set! (.-innerHTML output-el)
             (reduce #(let [{:keys [email name date message]} %2]
                        (str %1
                             "<div class='comment'>"
                             "<a class='avatar'>"
                             "<img src='" (gr/avatar-url (if email email "") :https true) "' />"
                             "</a>"
                             "<div class='content'>"
                             "<a class='author'>"
                             (gstring/htmlEscape (if name name "Anonymous"))
                             "</a>"
                             "<div class='metadata'>"
                             "<span class='date'>"
                             (gstring/htmlEscape date)
                             "</span>"
                             "</div>"
                             "<div class='text'>"
                             (gstring/htmlEscape message)
                             "</div>"
                             "</div>"
                             "</div>")) "" data))
       (set! (.-scrollTop output-el) (.-scrollHeight output-el))))
   
   (defn- init-msg-handler []
     (chsk-send!
       [:chat/init]
       8000
       (fn [reply]
         (if (sente/cb-success? reply)
           (update-msgs reply)
           #(.log js/console %)))))

画面表示用の関数は普通に文字列としてDOM生成してるだけです。ちなみにここだけ `semantic ui` 使ってます。

`init-msg-handler` は初期化時に呼び出すことを想定しています。
`chsk-send!` 関数の最後の引数にコールバック用の関数をおいておくとこれ勝手に呼んでくれて便利です。

クライアント側のイベント
===============================

まぁサーバー側とほとんど同じなのでソースだけ貼っておきます。

.. code-block:: Clojure

   ;; マルチメソッドによるサーバーからのイベント待受
   ;; :idで判別される
   ;;
   (defmulti -event-msg-handler
     "Multimethod to handle Sente `event-msg`s"
     :id) ; Dispatch on event-id
   
   ;; デフォルトメソッド
   (defmethod -event-msg-handler
     :default ; Default/fallback case (no other matching handler)
     [{:as ev-msg :keys [event]}]
     (.log js/console (str "Unhandled event: " event)))
   
   (defmethod -event-msg-handler :chsk/state
     [{:as ev-msg :keys [?data]}]
     (let [[old-state-map new-state-map] (have vector? ?data)]
       (if (:first-open? new-state-map)
         (.log js/console (str "Channel socket successfully established!: " new-state-map))
         (.log js/console (str "Channel socket state change: " new-state-map)))))
   
   ;; broadcastの受信を行う
   (defmethod -event-msg-handler :chsk/recv
     [{:as ev-msg :keys [?data]}]
     (case (first ?data)
       :chat/msgs (update-msgs (second ?data))
       (.log js/console (str ?data))))
   
   (defmethod -event-msg-handler :chsk/handshake
     [{:as ev-msg :keys [?data]}]
     (let [[?uid ?csrf-token ?handshake-data] ?data]
       (.log js/console (str "Handshake: " ?data))
       (init-msg-handler)))
   
   (defn event-msg-handler
     "Wraps `-event-msg-handler` with logging, error catching, etc."
     [{:as ev-msg :keys [id ?data event]}]
     (-event-msg-handler ev-msg))
   
   (defn- send-msg-handler [e]
     (let [e ($ "chat-msg")
           v (.-value e)]
       (chsk-send! [:chat/post v])
       (set! (.-value e) "")))
   
   (defonce router_ (atom nil))
   (defn stop-router! [] (when-let [stop-f @router_] (stop-f)))
   (defn start-router! []
     (stop-router!)
     (reset! router_
             (sente/start-client-chsk-router!
              ch-chsk event-msg-handler)))
   
   (when-let [target-el ($ "chat-form")]
     (start-router!))
   
   (when-let [target-el ($ "chat-send")]
     (.addEventListener target-el "click" send-msg-handler))

こんな感じです。

============================================
まとめ
============================================

- `core.async` についてちょっと理解した。

  - 他のライブラリとか覗いても `core.async` をラップしたようなのとか、そもそも `core.async` だけでWebSocketしているような方もいたりでもうちょっと勉強したいです。

- 知らないライブラリ調べながら使うと自分が余り使ってなかった構文とかの練習になる

  - マルチメソッドとか積極的には使ってなかったのでいい勉強になります。

- Webアプリ楽しい

  - 仕事でも結構作ってますがやっぱり楽しいですね。
  - 個人的にはHerokuに上げるだとかデプロイするだとかのいざこざ含めて結構好きです。

一応次作るものは考えているのでそのうちまた何か書きます。
あ、あと最近Professional Clojureも平行して読んでいるのでそのまとめもそのうちということで。

こう遊んでるとますますClojureを仕事にしたくなる。
