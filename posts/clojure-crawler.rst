---
date: 2018-06-12 22:00
tags: 
  - clojure
  - programming
description: Clojureで画像を集めてみた
title: Clojureで○○画像を集める
slug: clojure-crawler
---

Clojureで○○画像を集める
################################

昔、と言っても一年弱ほど前ですがPythonで画像集めしたことがあって、
Clojureではどうやるんだろうと思ってやってみました。

==================================
使ったもの
==================================

- Enlive

  - テンプレートライブラリっぽいですが、 `BeautifulSoup` みたいなことするにはどうしようかとググったら出てきたので使いました。

==================================
ソース
==================================

そんなに大きいソースでも無いのでいきなり貼っちゃいます。

.. code-block:: clojure

   (ns crawler.core
     (:require [net.cgrand.enlive-html :as enlive]
               [clojure.edn :as edn]
               [ring.util.codec :refer [url-encode]]
               [clojure.java.io :refer [copy input-stream output-stream]]))
   
   ;; ここで999エラーが帰ってくる可能性がある
   ;; yahooは1時間に400回まで
   (defn get-contents [uri]
     (-> (java.net.URI. uri)
         enlive/html-resource))
   
   ;; ダウンロードのURL接続は直接もとのサイトに行っているならアクセス制限にかからないはず
   (defn download [{{src :href} :attrs} path]
     (let [bytes (java.io.ByteArrayOutputStream.)] 
       (with-open [pic (input-stream src)
                   out (output-stream path)] 
         (copy pic bytes) ;; URLからメモリにロード
         (.write out (.toByteArray bytes)))))
   
   (defn get-by-tagname [uri & tags]
     (let [pics (-> uri
                    get-contents
                    (enlive/select tags))] 
       (if (zero? (count pics))
         nil
         pics)))
   
   (defn run []
     (let [config (edn/read-string (slurp "config.edn"))
           org-word (get config "word")
           words (reduce #(str %1 "+" %2) (first org-word) (rest org-word))
           word (url-encode words)
           org-url (get config "url")
           dir (get config "dir")
           b (get config "page")
           step (get config "step")]
       (loop [page 1
              max 1
              url (format org-url word b)] 
         (if-let [pics (get-by-tagname url :div#ISm :div.gridmodule :div.SeR :p.tb :a)]
           (do
             (doseq [[pic names] (map (fn [p idx] [p idx]) pics (take 20 (iterate inc max)))]
               (download pic (str dir words "-" names ".png"))) 
             (Thread/sleep 10000) ;; 10秒間スリープ
             (recur (inc page) (inc (* page step 10)) (format org-url word (inc (* page step 10)))))
           nil))))

`run` 関数が大きくなっちゃってるのが気になる。

基本的にはyahoo画像検索の簡易検索から持ってくることにしてます。
単純にURLのクエリにページ情報とかが含まれているのでクロールしやすいってだけです。

また、設定ファイルを `config.edn` として外出しています。

.. code-block:: clojure

   {"url" "https://search.yahoo.co.jp/image/search?p=%s&ei=UTF-8&b=%s"
    "word" ["呪怨"]
    "page" 1
    "dir" "pic/"
    "step" 2}

保存先のフォルダとか検索語リストだとかを入れてます。1ページ20件と決まっているならstepは不要だったかも。

実際動かしてみると呪怨画像が溜まっているのがわかります。

.. image:: /images/Crawler.gif
   :alt: Crawler

==================================
まとめ
==================================

yahoo画像検索ではエロ画像は取得できない!
