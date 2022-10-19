---
date: 2018-04-05 23:00
tags:
  - clojure
  - programming
description: ClojureでWebアプリ作ってみた
title: ClojureでWebアプリ
slug: clojure-web
---

ClojureでWebアプリ
################################

前回に引き続きClojureです。

結構好きなので `これ <http://ayato-p.github.io/clojure-beginner/intro_web_development/>`_ を参考にしつつ
色々追加してWebアプリ作ってみました。

基本的には会社でのサンプル用に作ってた `Webアプリ <https://bitbucket.org/y_fujiwara/earthdemo>`_ がありまして・・・
今回はそれをリプレイス＆機能追加って感じで、天気みたり、検索した地域ブックマークしたりするWebアプリにしました。

- `作ったもの <https://earth-clj.herokuapp.com/>`_
- `リポジトリ。master一本なのは愛嬌 <https://gitlab.com/y-fujiwara/earth-clj.git>`_

============================================
使ったもの
============================================

- 認証

  - buddy
  - 特に苦労しなかった。
  - パスワードのハッシュ化とかも。

- ルーティング

  - Compojure
  - 参考にしたやつそのまんまですね。

- マイグレーション

  - migratus
  - そんなに困らなかったですが、herokuに上げるときにはかなり悩みました。

- クライアント側

  - ClojureScript

    - ``lein cljsbuild auto`` で使ってた。

  - Reagent

    - ClojureScriptでReact使えるやつ。hiccupと似たシンタックスが使いやすかったです。
      Reactの経験はあったのでそことの差に戸惑ったけど、どちらかと言うとClojureScriptと普通のJavaScriptの差ですかね。

  - cljsjs/chartjs
  - cljsjs/leaflet
  - cljsjs/moment

    - 各JavaScriptライブリのClojureラッパー


上記の物以外は上に書いた参考サイトと同じです。 (hiccup使ってたりとか)

============================================
苦労したところ
============================================

- ``jdbc`` が必ずリストで返してくること。

  - 知ってはいたが結構ハマりました。セッションからユーザー情報引っ張るところだったかな？

- ``ClojureScript`` と既存のJavaScriptライブラリの接続

  - ``new`` されたものを変数に置くこと前提にしていたりしてどうしようか悩みました。結局DOMに関することだったので
    一回対象の要素の中身消して作り直すとかにしてしまいましたが。

- ``environ`` ライブラリのアップデート

  - 調べたら、``env`` で読み出す ``project.clj`` に書いた内容は必ず文字列として持ってくるようになってみたいでした。
    `参考 <https://github.com/weavejester/environ/issues/36>`_

  - 結局DB設定は ``read-string`` で読むことで解決
  - booleanみたいなものを付けている場合は設定されているstringからif文掛けてboolean返すような関数を作って回避しました。

- DOMのAPI触る分にはそこまで楽にならないのかなと思いました。
  
  - 結局直接API触る必要がある。

.. code-block:: Clojure

   (defn- update-html [elem tag]
     (set! (.-innerHTML elem) tag))

- herokuデプロイ周り
  
  - まぁいつもデプロイはハマるんですがやっぱりハマりました。
  - migratusどうやって実行させるか。結局参考サイトと同様に ``main.clj`` での実行前にやらせてしまう方向にしてしまいました。
  - mainメソッド使うのどうせデプロイ時だけだし良いかなと・・・

.. code-block:: Clojure

   (ns earth-clj.main
   (:require [earth-clj.core :as core]
             [migratus.core :as migratus]
             [earth-clj.db :as db])
   ; mainクラスの生成
   (:gen-class))
 
   ; 第一引数にthisを取らないとstatic
   (defn -main [& {:as args}]
     ;; 起動時にmigratusのマイグレーション
     (migratus/migrate db/migrate-spec)
     (core/start-server
       :host (get args "host") :port (get args "port") :join? true))

============================================
楽しかったところとか良かったところとか
============================================

- 適当に関数を小分けにするだけでも効果を感じられる。

  - DOMのエレメント取るだけとかそういうのも関数にしましたが、スレッドマクロとかと組み合わせると単純な関数の小分けでも結構効果を感じられました。
  - 関数型の複数の関数を組み合わせる抽象化が結構実感できた気がします。特にClojureScriptで一つのイベントで複数の変更をするだとかのときは。

- hiccupめっちゃ良い

  - html書くのが苦にならない
  - ``jade`` とか ``haml`` とかも触ったことありましたが、一番感触よかったです。
    特殊構文ではなくて言語に沿ったデータ構造になっているからな気もします。

- ``ClojureScript`` でのDOM更新とかは結構スマートにかける気がしました。

  - ``document.getElementById`` とかで取った要素に対して何かつけるとかが、 スレッドマクロ使うとわかりやすいと思いました。
  - ただし、一つの関数で複数のDOMに関して操作したいときは悩みました。結局普通に複数の式書いちゃいましたが・・・

.. code-block:: Clojure

   (defn- owm-ajax-handler [callback response]
     (let [weather (first (get-edn response "weather"))
           sys (get-edn response "sys")
           main (get-edn response "main")
           wind (get-edn response "wind")
           clouds (get-edn response "clouds")
           coord (get-edn response "coord")]
       (-> (util/$ "weather")
           (update-html (image-elem weather)))
       (-> (util/$ "city-name")
           (update-text (title-text (gstring/htmlEscape (get-edn response "name")))))
       (-> (util/$ "weekly-city")
           (update-text (gstring/htmlEscape (get-edn response "name"))))
       (-> (util/$ "temperature")
           (update-text (gstring/htmlEscape (util/calc-temp (get-edn main "temp")))))
       (-> (util/$ "sunrise")
           (update-text (util/unix-to-time-full (gstring/htmlEscape (get-edn sys "sunrise")))))
       (-> (util/$ "sunset")
           (update-text (util/unix-to-time-full (gstring/htmlEscape (get-edn sys "sunset")))))
       (-> (util/$ "pressure")
           (update-text (str (gstring/htmlEscape (get-edn main "pressure")) "hpa")))
       (-> (util/$ "humidity")
           (update-text (str (gstring/htmlEscape (get-edn main "humidity")) "%")))
       (-> (util/$ "wind")
           (update-text (str (gstring/htmlEscape (get-edn wind "speed")) "m/s")))
       (-> (util/$ "cloud")
           (update-text (str (gstring/htmlEscape (get-edn clouds "all")) "%")))
       (-> (util/$ "latlon")
           (update-text (str (gstring/htmlEscape (get-edn coord "lat")) " " (gstring/htmlEscape (get-edn coord "lon")))))
       (callback (get-edn coord "lat") (get-edn coord "lon"))))

Ajaxでコールバックするときに ``partial`` したりとか言う工夫もしてましたが、通常のJavaScriptでも変わらない気がしました。

その他にもクロージャ作って状態を閉じ込める ``Reagent`` とかも触っててなるほどなと思いました。

============================================
まとめとか
============================================

- 全体的に ``Clojure`` でのデータ構造とかはかなり触ってて気持ちがいいです。

  - 『プログラミングClojure』とかにもありますが、APIからデータそのものについて考えるべしって思想が感じられるのがすごい感触良いです。
  - 学生自体はPython使ってましたが、いい意味で言語の思想を押し付けられる系の言語が好きなようです。

- まだまだこの書き方で良いの？って部分がある。
  
  - 上記の例でも貼り付けましたが、一つの関数の中で複数の式書いたりしてるのありなの？って気分です。

- サーバー側はほとんど最初に出した参考サイトのままなのでもうちょっといろいろいじれたら良いかなと思います。

  - ClojureScriptは1からだったので結構頑張りました。
  - 個人的にはクライアント側はそこまで趣味じゃないのでその他の部分を頑張りたいところです。別に嫌いなわけではないですが・・・

多分しばらくClojureで遊んでいると思うので4Clojureやるかアルゴリズムクイックリファレンス続きやるかでもしていると思います。
仕事にできれば良いなと思いますがもうちょっと精進が必要ですかね。
