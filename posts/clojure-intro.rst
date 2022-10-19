---
date: 2018-03-02 01:00
tags:
  - clojure
  - programming
description: Clojure入門Clojureで画像を集めてみた
title: プログラミングClojureまとめ
slug: clojure-intro
---

プログラミングClojureまとめ
################################

大分久しぶりの投稿。ブロックチェーンで遊んだりしてました。

プログラミングClojureちょっと前にやったので気になったところをまとめておきます。
ついでにアルゴリズムクイックリファレンスの探索のところをClojureでやったので適当にのせつつ

==================================
再帰
==================================

用意されているライブラリ > `lazy-seq` > `recur` > 再帰って感じのおすすめらしいです。なので、ライブラリに合った関数がなければ `lazy-seq` を使う。
`lazy-seq` にすることで再帰によって起こされるJVMの問題を解決しようとしているらしい。
ただ、正直 `lazy-seq` について理解するのが若干難しいと感じてます。

二部探索を `recur` で書いたやつ。 `loop` と `recur`

.. code-block:: clojure

   (defn binary-search [array target]
       (loop [harf (sort array)]
           (let [mid (quot (count harf) 2)]
               (cond
                   (= (count harf) 0) false
                   (= (nth harf mid) target) true
                   (< (nth harf mid) target) (recur (drop (+ mid 1) harf))
                   (> (nth harf mid) target) (recur (take mid harf))
                   :else false))))

`lazy-seq` をつかったやつその１。これは本からの写し。この手の無限シーケンスつくって `take` とかで取り出すのはなんとなく理解できる。

.. code-block:: clojure

   (defn fibo
     ([] (concat [0 1] (fibo 0N 1N)))
     ([a b]
       (let [n (+ a b)]
         (lazy-seq cons n (fibo b n)))))

無限のものではなくて、与えられたリストとかに対して使おうとすると理解が難しくなる印象。
以下の二部探索木のノードを追加する部分で使ってみたがあっているかわからない。

.. code-block:: clojure

   (defn- add-node
       [{value :value left :left right :right height :height :as node} data]
           (into {} (lazy-seq ;そもそも使い方あってんの？
               (if (<= data value)
                   (if (nil? left)
                       (assoc node :left (create-node data))
                       (assoc node :left (add-node (node :left) data)))
                   (if (nil? right)
                       (assoc node :right (create-node data))
                       (assoc node :right (add-node (node :right) data)))))))

なんでここで使おうと思ったかというと、 `assoc` とかの引数で再帰することになるので末尾再帰にならないんじゃね？から
こういう場面で `recur` は良いのだろうかとか考えた結果という具合。なのでそもそも使い方があっているのかすらわからない。

とりあえずは動いている感じ。ちなみに以下6つのルールが紹介されてました。

- 直接再帰しない
- 要素数が決まっているものは `recur` を使って再帰する
- 巨大だったり要素数がわからないものについては `lazy-seq`
- 遅延シーケンスをやたらと実体化しない
- シーケンスライブラリに熟知する
- 問題を細かくする

自分で書いてて思いましたが、二部探索木だと要素数わかっているし `recur` でよいのでは？あと `into {}` すると実体化されている気もする。

==================================
状態管理
==================================

超うろおぼえ

普通はClojureではほとんどのものが変更不可能ですが、 `ref` とか `alter` とか `commute` だとか使うと変更可能にできる。

ただし、変更可能にすることで非同期とか並行処理とかで競合が発生する可能性は当然高まるので、そこら辺で使い分けるとのこと。

正直ほとんど覚えてないので読み返さないと・・・並行処理周りを支えているっぽいので。


==================================
オブジェクト指向的なの色々
==================================

Java側のAPIを呼ぶ方法は結構前のほうで出てきてましたが、Clojureらしくこの手のことをやるにはどうするかが書いてありました。

一番おもしろいなと思ったのはプロトコル使ってデータ型に対して外からの拡張が出来る点です。

`extend-type` とか使って既存のデータ型に後付するのが面白そう。

.. code-block:: clojure

   (defprotocol Hoge
     (hoge [this])
     (hogehoge [this i]))

   (extend-type Integer
     Hoge
     (hoge [a] a)
     (hogehoge [a i] (+ a i)))

ただ、この章でJavaで言うところのクラス定義的なやり方がいくつか出てきたが使い分けがよくわからない。
とりあえず `defrecord` にしている感じ。

それ以外にはマルチメソッドとかも面白かったです。

============================
まとめ
============================

`Lisp` 系の言語初めてでしたがかなり面白かったので継続して触り中です。

カッコいかがなものかと思っていましたが、書いてみるとしっくりきます。

ただ、JavaのサンプルをClojureに変更しようとすると無駄にクラスとかメソッドに意識を持っていかれて
無意味な `defprotocol` とか `defrecord` とかしちゃうのでここらへんは使わないで済むのならなるべく使わない方向が良いのかなぁとか思っています。

============================
おまけ
============================

冒頭でも書きましたがアルゴリズムクイックリファレンスのサンプルをClojureで幾つか書き直してので貼ってみます。


ハッシュサーチ

.. code-block:: clojure

   (def ^:private table-size 6)

   (defn- generate-hash [val]
       (if (not val) 
           nil
           (let [code (.hashCode val)]
               (cond
                   (< code 0) (mod (* -1 code) table-size)
                   :else (mod code table-size)))))
 
   (defn- hash-load [array]
       (loop [hash-table (vec (repeat table-size [])) array array]
           (let [head (first array) rest (rest array) hash-val (generate-hash head)]
               (cond
                   (= (count array) 0) hash-table
                   :else (recur (assoc hash-table hash-val (conj (nth hash-table hash-val) head)) rest)))))
 
   (defn- inner-check [inner-array target]
       (loop [head (first inner-array) array inner-array]
           (cond
               (.equals head target) true
               (= (count array) 0) false
               :else (recur (first array) (rest array)))))
 
   (defn- search-exec [table target]
       (let [table-val (nth table (generate-hash target))] 
           (cond
               (= (count table-val) 0) false
               (= (count table-val) 1) true
               :else (inner-check table-val target))))
 
   (defn hash-search [array target]
       (-> array
           hash-load
           (search-exec target)))

線形探索

.. code-block:: clojure

   (defn linear-search [array target]
       (loop [head (first array) tail (rest array)]
           (cond
               (= head target) true
               (= (count tail) 0) false
               :else (recur (first tail) (rest tail)))))

ブルームフィルタ

.. code-block:: clojure

   (defn- add-bits [bit data size fns]
       (loop [bit bit func (first fns) funcs (rest fns)]
           (cond
               (nil? func) bit
               :else (recur (bit-or bit (bit-shift-left 1 (func data size))) (first funcs) (rest funcs)))))
 
   (defn- contains [bit value size fns]
       (loop [func (first fns) funcs (rest fns)]
           (cond
               (nil? func) true
               (= (bit-and bit (bit-shift-left 1 (func value size))) 0) false
               :else (recur (first funcs) (rest funcs)))))
 
   (defn- array-add-bits [array size fns]
       (loop [bit 0 head (first array) tail (rest array)]
           (cond
               (nil? head) bit
               :else (recur (add-bits bit head size fns) (first tail) (rest tail)))))
 
   (defn bloom-filter
       ([array value] 
           (let [size 1000 fns [(fn [e s] (mod (.hashCode e) s))]]
               (contains (array-add-bits array size fns) value size fns)))
       ([array value size] 
           (let [fns [(fn [e size] (mod (.hashCode e) size))]]
               (contains (array-add-bits array size fns) value size fns)))
       ([array value size fns] (contains (array-add-bits array size fns) value size fns)))
