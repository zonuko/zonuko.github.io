---
date: 2018-05-24 23:00
tags:
  - clojure
  - programming
description: ClojureでWebアプリ作ってみたつづきその2
title: ClojureでWebアプリ続きの続き(外部APIと連携するchannel)
slug: clojure-web3
related_posts: clojure-web2
---

ClojureでWebアプリ続きの続き(外部APIと連携するchannel)
#######################################################

真面目に前回で終わりだと思ってたんですが、 `core.async` とか調べている内に意欲が・・・

今回はWolfram Alphaって言う質問応答サービスを利用してチャットにQAを組み込みます。
結構前に書いてたProgramming Phoenixで最後の方にやってたやつと似たような感じです。

============================================
導入
============================================

今回は以下を使いました。

- `[com.stuartsierra/component "0.3.2"]`

  - `sente` のソケットとAPI問い合わせ用の `channel` を管理するためです。ついでに使ってみようってことで。

また、チャットにて@wolframが最初についているものを対象リクエストとみなします。

============================================
問い合わせ部分の本体実装
============================================

`channel` で待ち受けてAPIに問い合わせるだけです。

.. code-block:: Clojure

   (ns earth-clj.wolfram
     (:require [clojure.core.async :refer [go-loop <! >!]]
               [ring.util.codec :as codec]
               [earth-clj.socket :refer [ch-chsk]]
               [clojure.xml :as xml]
               [clojure.zip :as zip]))
 
   ;; TODO: pipeとかpipelineを使ってch-chskとwolfram-chをつなげる
 
   (defonce ^:private app-id "XXXXX-XXXXXXXXX")
 
   (defn- make-url [input]
     (println input)
     (str "http://api.wolframalpha.com/v2/query?appid="
          app-id
          "&input="
          (codec/url-encode input)
          "&format=plaintext"))
 
   (defn- xml->data [input]
     (some-> input
             make-url
             xml/parse
             zip/xml-zip
             zip/down
             zip/right
             zip/down
             zip/down
             zip/down
             first))
 
   (defn start-wolfram-service [wolfram-ch]
     (go-loop []
       (when-let [{:as ev-msg :keys [ring-req ?data]} (<! wolfram-ch)]
         (>! (:reader ring-req) (assoc ev-msg :?data
                                              (if-let [ans (xml->data ?data)]
                                                ans
                                                "I have no idea.")))
         (recur))))

`go-loop` で待ち受けて何か来たらWolfram Aplhaからxmlもらってくる感じです。
`some->` とか初めて使いました。
データが取得出来たらDB登録用の `channel` にデータを突っ込みます。

また、 `xml-zip` 使うと木構造みたいな感じにしてくれるのであとは適当に探索すればよかったので
それなりに楽でした。(使い方を掴むまでは結構試行錯誤でしたが・・・)

================================
sente側
================================

`sente` 側は `websocket` を通して来たリクエストに対して、正規表現を使って場合分けするだけです。

.. code-block:: Clojure

   ;; 正規表現
   (def ^:private prefix #"(^@wolfram)(.*)")
 
   (defmethod -event-msg-handler
     :chat/post
     [{:as ev-msg :keys [event id ?data ring-req ?reply-fn send-fn]}]
     ;; nthでも良いけどIndex~の例外が出るのでlastにする
     ;; 正規表現的に最大でも3つの要素のvectorになる
     (when-let [msg (last (re-find prefix ?data))]
       (go
         (>! (:qasystem ring-req) (assoc ev-msg :?data msg))))
     (message/add-messages (get-in ring-req [:session :identity]) ?data)
     (msgs-broadcast))
 
   ;; Wolframから返されるものを待ち受ける
   (defn watch-wolfram-service [watch-ch]
     (go-loop []
       (when-let [{:as ev-msg :keys [ring-req ?data]} (<! watch-ch)]
         (message/add-messages (get-in ring-req [:session :identity]) ?data)
         (msgs-broadcast)
         (recur))))

`watch-wolfram-service` を `component` から起動される関数にしています。
これはWolfram側から問い合わせが来る `go-loop` になってます。

結局 `channel` をコールバックみたいにしか使えてないのが心残り・・・

============================================
コンポーネントの実装
============================================

ここまで作ったものとサーバーの起動をまとめます。

.. code-block:: Clojure

   (ns earth-clj.component
     (:use [org.httpkit.server :only [run-server]])
     (:require [com.stuartsierra.component :as component]
               [taoensso.sente :as sente]
               [clojure.core.async :refer [go-loop <! >! chan] :as async]
               [earth-clj.socket :as socket]
               [earth-clj.wolfram :as wolfram]
               [earth-clj.core :as earth]))
 
   ;; 基本的には変更可能な状態をコンポーネントに押し込めるイメージ
   ;; 単純にrefやatomで持ってたものをrouter_などのローカル変数に押し込める
 
   (defrecord Wolfram [qasystem]
     component/Lifecycle
     (start [this]
       (let [wolfram-ch (chan)]
         (println ";; Starting Wolfram Alpha")
         (wolfram/start-wolfram-service wolfram-ch)
         (assoc this :qasystem wolfram-ch)))
     (stop [this]
       (println ";; Wolfram stopped")
       (assoc this :qasystem nil)))
 
   (defn create-wolfram []
     (map->Wolfram {}))
 
   ;; WebSocketコンポーネント
   (defrecord Socket [router]
     component/Lifecycle
     (start [this]
       (if router
         this
         (do (println ";; Starting Chat Socket")
             (let [router_ (sente/start-server-chsk-router! socket/ch-chsk socket/event-msg-handler)
                   read-ch (chan)]
               (socket/watch-wolfram-service read-ch)
               (assoc this :reader read-ch :router router_)))))
     (stop [this]
       (if (not router)
         this
         (do (try (router)                                     ;; router自身が終了用の関数
                  (catch Throwable t
                    ";; Error when stopping database"))
             (println ";; Database stopped")
             (assoc this :reader nil :router nil)))))
 
   ;; Socketコンポーネントの作成用関数
   (defn create-socket []
     (map->Socket {}))
 
   ;; requestにQAコンポーネントとその受信用チャネルを追加するミドルウェア
   (defn wrap-app-component [f qa reader]
     (fn [req]
       (f (assoc req :reader reader :qasystem qa))))
 
   ;; ミドルウェアを適用したringハンドラを返す関数
   (defn make-handler [qa reader]
     (wrap-app-component earth/app qa reader))
 
   (defrecord Server [server host port join? router qasystem]
     component/Lifecycle
     (start [this]
       (if server
         this
         (do (println ";; Starting HTTP Server")
             (let [server (run-server (make-handler (:qasystem qasystem) (:reader router))
                                      {:host  host
                                       :port  port
                                       :join? join?})]
               (assoc this :server server)))))
     (stop [this]
       (if (not server)
         this
         (do (try (server)                                     ;; http-kitの終了
                  (catch Throwable t
                    (print ";; Error when stopping HTTP server")))
             (println ";; HTTP server stopped")
             (assoc this :server nil)))))
 
   ;; HTTPサーバコンポーネント
   (defn create-http-server [host port join?]
     ;; map->ReacodNameで引数に与えられたMapからレコードを生成する
     (map->Server {:host host :port port :join? join?}))
 
   ;; システム作成用関数
   (defn create-system [& {:keys [host port join?]
                           :or   {host "localhost" port 4000 join? false}}]
     (component/system-map
       :qasystem (create-wolfram)
       :router (create-socket)
       :server (component/using
                 (create-http-server host port join?)
                 [:router :qasystem])))

使い方が合っているかは謎。
`let` とかで作ったchannelを引数に渡すことで `go-loop` を起動してたりします。
また、 `qasystem` と `router` は互いに依存してますが、 `component/using` でやろうとすると
怒られたので `server` がどちらにも依存しているって形式にしました。

あとはリクエストマップに `channel` を押し込んでいる部分ですがこれでいいのかかなり微妙な気分ではあります。

============================================
出来たもの
============================================

Twitterにも似たようなの投稿しましたが出来たものは以下みたいなやつです。
`@wolfram qa` でちゃんとした質問なら `qa` の回答が自動で帰ってきます。

.. image:: /images/Wolfram.gif
  :alt: Quicksilver

============================================
まとめ
============================================

- `component` はPhoenixのUmbrellaに似ていると思った

  - やろうと思えば `channel` 同士の依存とかも管理できそう？　
  - 依存先が落ちたら再起動とか出来るんだろうか

- `core.async` の簡単な使い方が分かった

  - 本当は `pipeline` とか `pipe` とか使いたかったですが上手くいかず。
