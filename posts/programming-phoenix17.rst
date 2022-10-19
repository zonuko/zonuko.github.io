---
date: 2017-02-06 22:18
tags:
  - phoenix
  - elixir
  - programming
description: Programming Phoenixって本を読むその17
title: Programming Phoenix勉強その17
slug: programming-phoenix17
related_posts: programming-phoenix16
---


Programming Phoenix勉強その17
################################

その17です。ここから ``chapter11`` です。
``OTP`` で簡単なアプリを作ります。次の章にそれをアンブレラプロジェクトの下に置きます。

============================================
Counterアプリの作成
============================================

はじめに素朴な ``send`` と ``receive`` を使ったカウンターアプリを作ります。

``lib/rumbl/counter.ex`` を実装します。

.. code-block:: Elixir

   defmodule Rumbl.Counter do
     # listenにメッセージを送信する
     def inc(pid), do: send(pid, :inc)
     def dec(pid), do: send(pid, :dec)
   
     # listenで保持されている状態を取得する
     def val(pid, timeout \\ 5000) do
       # プロセスにリファレンスという形でマークを付ける
       # リクエストに対してレスポンスを紐付ける同期処理
       ref = make_ref()
       send(pid, {:val, self(), ref})
       receive do
         {^ref, val} -> val
       after
         timeout -> exit(:timeout)
       end
     end
   
     # エントリポイント
     def start_link(initial_val) do
       {:ok, spawn_link(fn -> listen(initial_val) end)}
     end
   
     # 無限ループでval状態を保持する
     defp listen(val) do
       receive do
         :inc -> listen(val + 1)
         :dec -> listen(val - 1)
         {:val, sender, ref} ->
           send sender, {ref, val}
           listen(val)
       end
     end
   end

以下で動作を確かめられます。

.. code-block:: shell

   iex> {:ok, pid} = Counter.start_link(0)
   {:ok, #PID<0.259.0>}
   iex> pid
   #PID<0.259.0>
   iex> Counter.inc(pid)
   :inc
   iex> Counter.val(pid)
   1
   iex> Counter.dec(pid)
   :dec
   iex> Counter.dec(pid)
   :dec
   iex> Counter.val(pid)
   -1

``start_link`` 関数でプロセスを開始します。これは ``listen`` 関数の再帰呼び出しによって無限ループになっています。
``listen`` 関数によって保存される状態はPIDによって識別されるため ``inc`` 関数や ``dec`` 、 ``val`` 関数
にそのPIDを与えています。

次に素朴な非同期通信から ``OTP`` の ``GenServer`` を使ってみます。

============================================
CounterアプリのOTP化
============================================

``Counter`` を ``OTP`` を使ったものにしてみます。

.. code-block:: Elixir

   defmodule Rumbl.Counter do
     use GenServer
   
     # listenにメッセージを送信する
     def inc(pid), do: GenServer.cast(pid, :inc)
     def dec(pid), do: GenServer.cast(pid, :dec)
   
     def val(pid) do
       # 値が返ってくるのを待つ必要があるため同期呼び出し
       GenServer.call(pid, :val)
     end
   
     def start_link(initial_val) do
       GenServer.start_link(__MODULE__, initial_val)
     end
   
     def init(initial_val) do
       {:ok, initial_val}
     end
   
     def handle_cast(:inc, val) do
       {:noreply, val + 1}
     end
   
     def handle_cast(:dec, val) do
       {:noreply, val - 1}
     end
   
     def handle_call(:val, _from, val) do
       {:reply, val, val}
     end
   end

``GenServer`` を使ったものに変更しました。大分すっきりしました。
同期処理の ``handle_call`` は値を返すことを期待するため ``{:reply, val, val}`` を返しています。
非同期処理の ``handle_cast`` は値を返さない非同期処理なので ``{:noreply, val ± 1}`` としています。

また、 ``OTP`` 化しましたので元の ``Rumbl`` アプリに組み込んでみます。 ``lib/rumbl.ex`` をちょっと変更します。

.. code-block:: Elixir

   children = [
     # Start the Ecto repository
     supervisor(Rumbl.Repo, []),
     # Start the endpoint when the application starts
     supervisor(Rumbl.Endpoint, []),
     # Start your own worker by calling: Rumbl.Worker.start_link(arg1, arg2, arg3)
     worker(Rumbl.Counter, [5]), # 追加
   ]

``Rumbl`` アプリ起動時にワーカーとして ``Counter`` を起動するように追加しました。
ワーカーとして追加することで ``start_link`` が自動で呼び出され、第二引数のものを引数として起動します。

============================================
クラッシュ時の動作
============================================

せっかく ``Supervisor Tree`` に ``Counter`` を追加してみたので、クラッシュさせたときの動作も見てみます。

``counter.ex`` をクラッシュさせるようにしてみます。

.. code-block:: Elixir

   def init(initial_val) do
     # :tickメッセージを1000ミリ秒後に自分自身に送信
     Process.send_after(self(), :tick, 1000)
     {:ok, initial_val}
   end
 
   # valが0以下になったらわざとクラッシュさせる
   def handle_info(:tick, val) when val <= 0, do: raise "boom!"
 
   # send_afterで自分自身に送られたものを受け取る
   def handle_info(:tick, val) do
     IO.puts "tick #{val}"
     Process.send_after(self(), :tick, 1000)
     {:noreply, val - 1}
   end

以下のような表示がコンソールにされます。

.. code-block:: shell

   iex> tick 5
   iex> tick 4
   iex> tick 3
   iex> tick 2
   iex> tick 1
   iex> [error] GenServer #PID<0.348.0> terminating
   ** (RuntimeError) boom!
       (rumbl) lib/rumbl/counter.ex:38: Rumbl.Counter.handle_info/2
       (stdlib) gen_server.erl:615: :gen_server.try_dispatch/4
       (stdlib) gen_server.erl:681: :gen_server.handle_msg/5
       (stdlib) proc_lib.erl:240: :proc_lib.init_p_do_apply/3
   Last message: :tick
   State: 0
   iex> tick 5

デクリメントされ0以下になったときにプロセスがクラッシュしていることがわかります。
さらに、自動で与えていた初期値で再起動しています。

============================================
クラッシュ時の各戦略について
============================================

``worker`` の再起動戦略は以下の設定が可能です。 ``worker`` の第三引数として ``restart: :permanent`` のような形式で指定します。

- ``:permanent`` : デフォルトの戦略。上記のような挙動をする。
- ``:temporary`` : クラッシュ時に再起動しない。
- ``:transient`` : 正常終了以外でプロセスが終了した時に再起動を行う。

また、 ``supervisor`` の監視戦略は以下のようなものがあります。

- ``:one_for_one`` : 子プロセスがクラッシュすると ``Supervisor`` はそのプロセスだけを再起動する。
- ``:one_for_all`` : 子プロセス全てを終了して再起動する。
- ``:rest_for_one`` : 終了した子プロセスにつながるプロセスのみ全て終了後再起動する。
- ``:simple_one_for_one`` : 基本的には ``:one_for_one`` だが、プロセスを動的に監視する必要がある場合に使う。 ``Supervisor`` に一つの子のみ定義する必要がある。

============================================
Agentについて
============================================

今まで書いてきた ``GenServer`` は ``Agent`` を使うともっと短く書けます。コンソールで試してみます。

.. code-block:: shell

   iex(1)> import Agent
   Agent
   iex(2)> {:ok, agent} = start_link fn -> 5 end, name: MyAgent
   {:ok, #PID<0.351.0>}
   iex(3)> update MyAgent, &(&1 + 1)
   :ok
   iex(4)> update MyAgent, &(&1 + 1)
   :ok
   iex(5)> get MyAgent, &(&1)
   7
   iex(6)> stop MyAgent
   :ok

また、 ``OTP`` は ``start_link`` で開始時に ``:name`` オプションでプロセスにPID以外の名前をつけることが出来ます。
``update`` 関数で状態を変更出来、 ``get`` 関数で状態を取得できます。
見てわかるように ``Agent`` は状態の保持に特化したものです。実際には中身で ``GenServer`` が呼ばれるようです。

このように ``GenServer`` 上の構成物になっているものの中の一つとして ``Phoenix.Channel`` があります。

============================================
まとめ
============================================

- プロセスを起動するには ``GenServer`` を使う。
- プロセスの戦略は ``worker`` 自身の設定と ``children`` に対する ``supervisor`` の監視戦略で行う。
- ``Agent`` は ``GenServer`` の状態管理特化の抽象化。 
- ``Phoenix.Channel`` も ``Agent`` 同様に ``GenServer`` の抽象化。
