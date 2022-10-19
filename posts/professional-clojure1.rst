---
date: 2018-05-27 23:00
tags: 
  - clojure
  - programming
description: Profession Clojureを読む第1章
title: Professional Clojureメモその1
slug: pro-clojure
---

Professional Clojureメモその1
################################

Profession Clojureって本を買ったのでメモしていこうと思います。

.. raw:: html

   <div class="kaerebalink-box" style="text-align:left;padding-bottom:20px;font-size:small;/zoom: 1;overflow: hidden;"><div class="kaerebalink-image" style="float:left;margin:0 15px 10px 0;"><a href="https://www.amazon.co.jp/exec/obidos/ASIN/B01G7S4SGK/zonuko-22/" target="_blank" ><img src="https://images-fe.ssl-images-amazon.com/images/I/51PAVy95uvL._SL160_.jpg" style="border: none;" /></a></div><div class="kaerebalink-info" style="line-height:120%;/zoom: 1;overflow: hidden;"><div class="kaerebalink-name" style="margin-bottom:10px;line-height:120%"><a href="https://www.amazon.co.jp/exec/obidos/ASIN/B01G7S4SGK/zonuko-22/" target="_blank" >Professional Clojure</a><div class="kaerebalink-powered-date" style="font-size:8pt;margin-top:5px;font-family:verdana;line-height:120%">posted with <a href="http://kaereba.com" rel="nofollow" target="_blank">カエレバ</a></div></div><div class="kaerebalink-detail" style="margin-bottom:5px;">Jeremy Anderson,Michael Gaare,Justin Holguín,Nick Bailey,Timothy Pratley Wrox 2016-05-25    </div><div class="kaerebalink-link1" style="margin-top:10px;"></div></div><div class="booklink-footer" style="clear: left"></div></div>

ちなみに章ごとです。今回は第1章です。

第1章ではClojureの関数型の部分についてJavaと比較するような形で書かれています。
最初は細かく書こうと思ったんですが、思ったよりボリューム満点だったので適当にClojureの部分だけ要約します。

============================================
再帰
============================================

Programming Clojureとか読んでると今更な感もあるんですが、触れられていました。

通常の再帰ではスタックがあふれるので、 ``recur`` を使って末尾再帰します。 ただし、 JVMは末尾呼び出し最適化をサポートしてないのでシュミレートしているだけのようです。('tail call optimazation'とあったので末尾呼び出し最適化としておきます。)

.. code-block:: Clojure

   (defn factorial2 [n]
     (loop [count n acc 1]
       (if (zero? count)
         acc
         (recur (dec count) (* acc count)))))

相互再帰は ``trampoline`` でやる感じです。ただし、サンプルでは普通の相互再帰と、 ``letfn`` でローカルに関数を2つ作ってそれを相互再帰する方も紹介されていました。
普通に相互再帰すると関数呼び出しが ``trampoline`` 付きでの呼び出しになるのが普通に関数呼び出せば良くなるのがメリットみたいです。

.. code-block:: Clojure

   ;; 使うときはtrampolineなしで普通に呼べば良い
   (defn my-even? [n]
     (letfn [(e? [n] (if (zero? n) true #(o? (dec n))))
             (o? [n] (if (zero? n) false #(e? (dec n))))]
       (trampoline e? n)))
 
   ;; trampolineはmy-evenの中に閉じ込められているのでそのまま使える
   (defn my-odd? [n]
     (not (my-even? n)))

============================================
高階関数
============================================

特に発見とかもなかったです。 ``filter`` の例が出ていました。

.. code-block:: Clojure

   (def lst ["a" "b" "c" "d"])
   (filter #(= "a" %) lst)

それ以外にもコマンドパターンの比較があったりしました。

============================================
部分適用と合成関数
============================================

`partial` を使った部分適用について触れられています。
部分適用とかカリー化とか誤用の元なので触れるのに勇気がいる・・・

.. code-block:: Clojure

   (def twice (partial * 2))
   (map twice [1 2 3 4 5])

関数の合成の方は ``comp`` で出来ます。評価順は右から左って感じです。

.. code-block:: Clojure

   ;; 2足してから2倍する
   (map (comp (partial * 2) (partial + 2)) [1 2 3 4 5])

============================================
遅延評価
============================================

もっと使わないと全然理解が甘い気がしてて恐縮ですが、
 ``map`` とかでも ``lazy sequence`` を返してくる点が触れられています。

.. code-block:: Clojure

   ;; lazy-cat全く覚えてなかった
   ;; 素朴な使い方
   (lazy-cat [1 2 3] [4 5 6])
 
   ;; フィボナッチ ただしプログラミングClojureで紹介されている良くないパターン
   ;; map以下では自分自身が常に変更されて計算されていくイメージ
   ;; [1 1]のときはmapの引数は[1] [1]となり、2が計算される
   ;; 2が分かると[1 1 2]となり[1 1 2]と[1 2]となり3が計算される
   ;; 3が分かると[1 1 2 3]となり[1 1 2 3]と[1 2 3]となり5が計算される
   ;; 以下無限に続くものがmapの引数となるリスト
   (def fib-seq
     (lazy-cat [1 1] (map + (rest fib-seq) fib-seq)))

============================================
変更可能な仲間
============================================

Atom
============================================

最もシンプルな変更可能な値。協調動作を行わない前提だったり、独立した値に使えるっぽいです。
一度に複数変更しない場合にのみ使う感じです。

.. code-block:: Clojure

   ;; そのまま表示すると#atom[{} 0x755e4715]って感じでセットした値とハッシュ値のセットになる
   (def app-state (atom {}))
   ;; swap!で更新する。第二引数の関数をその後の引数を使って実行する
   ;; #atom[{:current-user "Jeremy"} 0x755e4715]な感じ
   (swap! app-state assoc :current-user "Jeremy")
   ;; 直接上書き更新する場合はreset!
   ;; #atom[{:aaa 1} 0x755e4715]
   (reset! app-state {:aaa 1})
   ;; derefか@で中身を取得
   (:aaa @app-state)

Ref
============================================

複数値の変更に使うやつです。いわゆるトランザクション。
ここらへんプログラミングClojureにもあったんですが要復習。

``atom`` との比較は割愛

.. code-block:: Clojure

   ;; refの定義方法はatomと似た感じ
   (def checking (ref {:balance 500}))
   ;; 協調動作実験用にもう一つ
   (def savings (ref {:balance 250}))
 
   ;; dosyncで協調動作
   ;; throwされると最初のcommuteは巻き戻される
   ;; 更新自体はalterも存在し、こっちは実行順が保証される
   (dosync
     (commute checking assoc :balance 700)
     (throw (Exception. "Oops..."))
     (commute savings assoc :balance 50))

============================================
Nilの扱い
============================================

Nil Punningって日本語にするとどういう感じなんだろう？上手い翻訳が出てこない・・・

.. code-block:: Clojure

   ;; nilはfalsy
   (if nil "true" "false")
 
   ;; firstとかみたいに配列の類いを渡すこと前提にしているものはnil渡すとnilを返す
   ;; 単純に想定されているものが来てないので最初の要素とかが無いので
   (first nil) ;; => nil
   (second nil) ;; => nil
   (seq? nil) ;; => false
 
   ;; 空のリストとかとはnilは違う
   (if '() "true" "false") ;; => "true"
 
   ;; falsyな値としてnilを扱っているのかnilとしてnilを使っているのか要注意
   ;; 以下の例はmapを扱う場合にValueとしてnilがあるとKeyが存在しないときに帰ってくるnilを判別が出来ない例
   (:foo {:foo nil :bar "baz"}) ;; => nil
   (:fooo {:foo nil :bar "baz"}) ;; => nil
   ;; mapはデフォルト値を指定できるのでKeyが無いときはそっちがいい
   (:fooo {:foo nil :bar "baz"} :not-found) ;; => :not-found

``(first 1)`` はなんでnilじゃないんだろう？

============================================
オブジェクト指向っぽいやつ
============================================

オーバーロードっぽいディスパッチは ``defmulti`` のマルチメソッドでできる

.. code-block:: Clojure

   ;; 第一引数に与えられた何某かで実際に呼び出されるメソッドが決まる
   (defmulti area (fn [shape & _] shape))
 
   ;; １つ目が:triangleの場合
   (defmethod area :triangle
     [_ base height]
     (/ (* base height) 2))
 
   ;; :sqareの場合
   (defmethod area :square
     [_ side]
     (* side side))
 
   ;; :rectの場合
   (defmethod area :rect
     [_length width]
     (* length width))
 
   ;; :circleの場合
   (defmethod area :circle
     [_ radius]
     (* radius radius Math/PI))

オーバーロードと違ってオブジェクトに紐づくようなメソッドではなく、
特定の条件から実際の関数がディスパッチされる単なる関数群という感じでしょうか

クラスっぽいやつ
============================================

``deftype`` とか ``defrecord`` でクラスが作れる。
``defrecord`` の方は普通の連想配列のようにも振る舞える

.. code-block:: Clojure

   (deftype hogehoge [hoge])
   (def h (hogehoge. 100))
   (.hoge h) ;; => 100
   (:hoge h) ;; => nil
 
   (defrecord foo [bar])
   (def f (foo. 100))
   (.bar f) ;; => 100
   (:bar f) ;; => 100

インターフェースぽいやつ
============================================

``interface`` っぽいやつとして ``defprotocol`` が紹介されていました。

.. code-block:: Clojure

   (defprotocol Shape
     (area [this])
     (perimeter [this]))
 
   (defrecord React [width length]
     Shape ;; Shapeプロトコルを実装
     (area [this] (* (:width this) (:length this)))
     (perimeter [this] (+ (* 2 (:width this)) (* 2 (:length this)))))

どちらかというとtraitとかに近いのかも？traitの方はちょっとかじった程度ですが。

``defrecord`` や ``deftype`` したくないけど特定の ``Var`` になにか処理を付け加えたいとき用に `reify` があるっぽいです。

.. code-block:: Clojure

   ;; recordやtypeではない単なるVarにprotocolを実装させる
   (def some-shape
     (reify Shape
       (area [this] "Area")
       (perimeter [this] "I calculate perimeter")))

============================================
その他
============================================

データの永続性についてとかを木構造を作って紹介されてましたがブログでは割愛します。

また、マクロの紹介として ``defroutes`` とかが紹介されていました。
マクロ自体の説明ではなくて何が出来るかとかそういう話です。

============================================
まとめ
============================================

- ほとんど復習でしたが、 ``trampoline`` の使い方とか参考になりました。
- ``honeysql`` とか紹介されてたのでそのうち使ってみたいです
