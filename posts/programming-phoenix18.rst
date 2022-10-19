---
date: 2017-02-09 23:52
tags:
  - phoenix
  - elixir
  - programming
description: Programming Phoenixって本を読むその18
title: Programming Phoenix勉強その18
slug: programming-phoenix18
related_posts: programming-phoenix17
---


Programming Phoenix勉強その18
################################

その18です。実際に ``OTP`` を使ったアプリを ``Rumbl`` に組み込みます。

============================================
InfoSysアプリの追加
============================================

``WolframAlpha`` のようなサービスを利用して動画の再生中に何かしらの質問をすると何か答えが返ってくるAPI
を追加します。

まず ``Supervisor`` を追加します。 ``lib/info_sys/supervisor.ex`` を実装します。

.. code-block:: Elixir

   defmodule Rumbl.InfoSys.Supervisor do
     use Supervisor
 
     def start_link() do
       Supervisor.start_link(__MODULE__, [], name: __MODULE__)
     end
 
     def init(_opts) do
       children = [
         worker(Rumbl.InfoSys, [], restart: :temporary)
       ]
       
       supervise children, strategy: :simple_one_for_one
     end
   end

今まで習ったとおりですが、戦略は ``:simple_one_for_one`` を使っています。

処理の本体が必要なので ``worker`` となる ``lib/info_sys.ex`` を実装します。これはバックエンドサービスが ``WolframAlpha`` 以外でも使えるように抽象化しておきます。

.. code-block:: Elixir

   defmodule Rumbl.InfoSys do
     # デフォルトのバックエンドサービス
     @backends [Rumbl.InfoSys.Wolfram]
 
     defmodule Result do
       defstruct score: 0, text: nil, url: nil, backend: nil
     end
 
     # バックエンドサービスのプロセスを開始する
     def start_link(backend, query, query_ref, owner, limit) do
       backend.start_link(query, query_ref, owner, limit)
     end
 
     def compute(query, opts \\ []) do
       limit = opts[:limit] || 10
       # 引数でバックエンドサービスが提示されてなければデフォルトを使う
       backends = opts[:backends] || @backends
 
       # 各バックエンドサービスに関してプロセスを開始する
       backends
       |> Enum.map(&spawn_query(&1, query, limit)
     end
 
     defp spawn_query(backend, query, limit) do
       query_ref = make_ref()
       opts = [backend, query, query_ref, self(), limit]
       # 起動済みのSupervisorに自分自身のプロセスを子として監視してもらう
       # これを呼び出すと自動でstart_linkが呼び出されてプロセス開始する
       {:ok, pid} = Supervisor.start_child(Rumbl.InfoSys.Supervisor, opts)
       {pid, query_ref}
     end
   end

モジュールのアトリビュート（ ``@backends`` ）でバックエンドサービスを管理しています。
``compute`` 関数を見てもらえればわかりますが、このアトリビュートに対して一つずつプロセスを起動しています。

戦略が ``:simple_one_for_one`` になっているので、子となるプロセスから ``Supervisor.start_child`` でプロセスを監視下に追加しています。

次に具体的なシステムを構築していきます。

============================================
Wolframを利用するアプリの構築
============================================

まず ``WolframAlpha`` を使うアプリを構築します。 ``mix.exs`` の ``deps`` に ``{:sweet_xml, "~> 0.5.0"},`` 
を追加して ``mix deps.get`` を実行しておきます。
この追加したモジュールはXMLのパーサーです。

また、 `ここから <https://www.wolframalpha.com/>`_ ``WolframAlpha`` のユーザ登録をしてAPIキーを取得します。ただし、当然ですがこのキーは ``dev.exs`` に直接書くのはNGです。
従って、 ``config/dev.secret.exs`` を用意して ``.gitignore`` に追加しておきます。
このファイルには ``WolframAlpha`` の設定を書いておきます。

.. code-block:: Elixir

   use Mix.Config
   
   config :rumbl, :wolfram, app_id: "XXXXXX-XXXXXXXXXX"

最後に、元々の ``dev.exs`` に ``import_config "dev.secret.exs"`` を一行追加して準備完了です。

準備が終わったので ``lib/rumbl/info_sys/wolfram.ex`` を実装します。

.. code-block:: Elixir

   defmodule Rumbl.InfoSys.Wolfram do
     import SweetXml
     alias Rumbl.InfoSys.Result
 
     def start_link(query, query_ref, owner, limit) do
       Task.start_link(__MODULE__, :fetch, [query, query_ref, owner, limit])
     end
 
     def fetch(query_str, query_ref, owner, _limit) do
       query_str
       |> fetch_xml()
       |> xpath(~x"/queryresult/pod[contains(@title, 'Result') or
                                    contains(@title, 'Definitions')]
                               /subpod/plaintext/text()")
       |> send_result(query_ref, owner)
     end
 
     defp send_result(nil, query_ref, owner) do
       send(owner, {:results, query_ref, []})
     end
 
     defp send_result(answer, query_ref, owner) do
       results = [%Result{backend: "wolfram", score: 95, text: to_string(answer)}]
       send(owner, {:results, query_ref, results})
     end
 
     defp fetch_xml(query_str) do
       {:ok, {_, _, body}} = :httpc.request(
         String.to_char_list("http://api.wolframalpha.com/v2/query" <> "?appid=#{app_id()}" <>
                                                                       "&input=#{URI.encode(query_str)}&format=plaintext"))
     end
 
     defp app_id, do: Application.get_env(:rumbl, :wolfram)[:app_id]
   end

- ``Task.start_link` でプロセスを起動しています。 ``Task`` は ``Agent`` と異なり、状態の保存ではなく、バックグラウンドでの関数起動に特化した ``OTP`` です。
- API呼び出しをしている部分は ``fetch_xml/1`` 関数です。 ``Erlang`` の ``:httpc`` を使ってリクエストを投げているみたいです。
- API呼び出しの結果を解析するのは ``SweetXml`` に含まれている ``xpath`` 関数です。自分も余り理解していないですが、 `サンプル <https://github.com/awetzel/sweet_xml>`_ とか見るとなんとなくわかります。
- ``xml`` のエレメントの ``queryresult/pod`` の属性 ``title`` が ``Result`` か ``Definitions`` の物の ``/subpod/plaintext/`` の要素をテキストで取れという感じのようです。
- 最後に ``send_result`` をパターンマッチによって呼び出します。呼び出し元の ``PID`` に結果を送り返します。

動きを試すには ``iex -S mix`` から以下のコマンドで確かめられます。

.. code-block:: shell

   iex> Rumbl.InfoSys.compute("what is elixir?")
   [{#PID<0.566.0>, #Reference<0.0.3.1660>}]
   iex> flush()
   {:results, #Reference<0.0.3.1660>,
    [%Rumbl.InfoSys.Result{backend: "wolfram", score: 95,
      text: "1 | noun | a sweet flavored liquid (usually containing a small amount of
    alcohol) used in compounding medicines to be taken by mouth in order to mask an u
   npleasant taste\n2 | noun | hypothetical substance that the alchemists believed to
    be capable of changing base metals into gold\n3 | noun | a substance believed to
   cure all ills",
      url: nil}]}
   :ok

良さそうですが、このままだとプロセスが死んだときも待ち続けてしまいます。
また、機能強化としてスコア順での整列と、タイムアウト処理を入れる必要もあります。

============================================
InfoSysアプリの機能拡張
============================================

API問い合わせの結果の値の畳み込みとプロセスが死んだときの処理を追加します。
``info_sys.ex`` を変更します。

.. code-block:: Elixir

   defmodule Rumbl.InfoSys do
     ...
     def compute(query, opts \\ []) do
       limit = opts[:limit] || 10
       # 引数でバックエンドサービスが提示されてなければデフォルトを使う
       backends = opts[:backends] || @backends
 
       # 各バックエンドサービスに関してプロセスを開始する
       backends
       |> Enum.map(&spawn_query(&1, query, limit))
       |> await_result(opts)
       |> Enum.sort(&(&1.score >= &2.score))
       |> Enum.take(limit)
     end
 
     defp spawn_query(backend, query, limit) do
       query_ref = make_ref()
       # 送り返される時に自分のPIDが必要なので第4引数はself()
       opts = [backend, query, query_ref, self(), limit]
       # 起動済みのSupervisorに自分自身のプロセスを子として監視してもらう
       # これを呼び出すと自動でstart_linkが呼び出されてプロセス開始する
       {:ok, pid} = Supervisor.start_child(Rumbl.InfoSys.Supervisor, opts)
 
       # プロセスの死活監視
       monitor_ref = Process.monitor(pid)
 
       {pid, monitor_ref, query_ref}
     end
 
     defp await_result(children, _opts) do
       await_result(children, [], :infinity)
     end
 
     defp await_result([head|tail], acc, timeout) do
       {pid, monitor_ref, query_ref} = head
 
       # wolframなどでsendされた結果を待ち受けてパターンマッチする
       receive do
         {:results, ^query_ref, results} ->
           Process.demonitor(monitor_ref, [:flush])
           # 再帰でmapの結果を処理する
           await_result(tail, results ++ acc, timeout)
         {:DOWN, ^monitor_ref, :process, ^pid, _reason} ->
           # モニタリングの結果失敗していた時
           await_result(tail, acc, timeout)
       end
     end
 
     defp await_result([], acc, _) do
       # 最終的には結果を合体したものを返す
       acc
     end
   end

``await_result`` 関数の再帰によって ``receive`` 結果の畳み込みを実装しました。
また、 ``Process.monitor`` によってプロセスの監視を追加しています。
プロセスが死んでいた場合は ``receive`` のパターンマッチによって正しく処理することができるようになりました。

============================================
タイムアウトの追加
============================================

タイムアウトを追加しますが、 ``receive`` と ``after`` を使ってしまうとブロッキングが発生してしまいます。
3つシステムがあって5秒ずつタイムアウトすると15秒待つことになります。
これを避けるために違う方法を使います。 ``await_result`` 関数を以下のように変更します。

.. code-block:: Elixir

   defmodule Rumbl.InfoSys do
     ...
     defp await_result(children, opts) do
       timeout = opts[:timeout] || 5000
       # 非同期で起動して決められた時間のあとメッセージを送信してくる
       timer = Process.send_after(self(), :timedout, timeout)
       results = await_result(children, [], :infinity)
       # タイマー実験用
       # :timer.sleep(5001)
       cleanup(timer)
       results
     end
 
     defp await_result([head|tail], acc, timeout) do
       {pid, monitor_ref, query_ref} = head
 
       # wolframなどでsendされた結果を待ち受けてパターンマッチする
       # メッセージが来るまで待ち続ける
       receive do
         {:results, ^query_ref, results} ->
           Process.demonitor(monitor_ref, [:flush])
           # 再帰でmapの結果を処理する
           await_result(tail, results ++ acc, timeout)
         {:DOWN, ^monitor_ref, :process, ^pid, _reason} ->
           # モニタリングの結果失敗していた時
           await_result(tail, acc, timeout)
         # Process.send_afterによって送られるメッセージ
         :timedout ->
           kill(pid, monitor_ref)
           await_result(tail, acc, 0)
       after
         timeout ->
           kill(pid, monitor_ref)
           # ひたすらここにはいることになるのでタイムアウト後は何もせずに終わる
           await_result(tail, acc, 0)
       end
     end
 
     defp await_result([], acc, _) do
       # 最終的には結果を合体したものを返す
       acc
     end
 
     defp kill(pid, ref) do
       Process.demonitor(ref, [:flush])
       Process.exit(pid, :kill)
     end
 
     defp cleanup(timer) do
       :erlang.cancel_timer(timer)
       receive do
         # ここでもタイムアウトメッセージが来る可能性があるため？
         :timedout -> :ok
       after
         0 -> :ok
       end
     end
   end

``Process.send_after`` を使って非同期タイムアウトを入れました。
設定された秒数立つとメッセージが送信されるのでそれを待ち受けるようにしました。

============================================
InfoSysアプリの組み込み
============================================

準備が整ったので ``InfoSys`` を ``Rumbl`` に組み込みます。
今まで作った ``OTP`` アプリを ``VideoChannel`` に組み込みます。

.. code-block:: Elixir

   defmodule Rumbl.VideoChannel do
     ...
     # クライアントから直接送信された時に受け取るコールバック
     def handle_in("new_annotation", params, user, socket) do
       changeset =
         user
         |> build_assoc(:annotations, video_id: socket.assigns.video_id)
         |> Rumbl.Annotation.changeset(params)
 
       case Repo.insert(changeset) do
         {:ok, ann} ->
           # コメントを取り敢えず保存
           broadcast_annotation(socket, ann)
           # コメントに対するInfoSysの結果を取得する(非同期)
           # 取得結果はwolframユーザのannotationとして保存される
           Task.start_link(fn -> compute_additional_info(ann, socket) end)
           {:reply, :ok, socket}
         {:error, changeset} ->
           {:reply, {:error, %{errors: changeset}}, socket}
       end
     end
 
     defp compute_additional_info(ann, socket) do
       # computeには結果をスコア順で先頭一つだけ取るように指示
       # googleとかの結果もほしいならlimit2とかにすれば良いはず 
       # 結果は要らないのでリスト内包表記の結果は呼び出し元でも受け取っていない
       for result <- Rumbl.InfoSys.compute(ann.body, limit: 1, timeout: 10_000) do
         attrs = %{url: result.url, body: result.text, at: ann.at}
 
         info_changeset = 
           Repo.get_by!(Rumbl.User, username: result.backend) # ユーザを取得
           |> build_assoc(:annotations, video_id: ann.video_id) # ユーザに紐づくannotationを作成
           |> Rumbl.Annotation.changeset(attrs) # annotationのchangesetを作成
 
         case Repo.insert(info_changeset) do
           # インサート出来たらInfoSysの結果を共通関数でブロードキャストする
           {:ok, info_ann} -> broadcast_annotation(socket, info_ann)
           {:error, _changeset} -> :ignore
         end
       end
     end
     
     defp broadcast_annotation(socket, annotation) do
       annotation = Repo.preload(annotation, :user)
       rendered_ann = Phoenix.View.render(AnnotationView, "annotation.json", %{
         annotation: annotation
       })
       broadcast! socket, "new_annotation", rendered_ann
     end
   end

ほとんどコメントのままですが、 ``Task.start_link`` を使って他の処理をブロッキングしないように、
``InfoSys.compute`` を呼び出しています。
``compute_additional_info`` を見てもらうとわかるように ``result.backend`` がユーザとして存在することが
前提となっているので ``seed`` で追加します。

``backend_seeds.exs`` を以下のように実装します。

.. code-block:: Elixir

   alias Rumbl.Repo
   alias Rumbl.User
   
   Repo.insert!(%User{name: "Wolfram", username: "wolfram"})

これでいつものようにスクリプトを実行すれば組み込みは完成です。

==================================
まとめ
==================================

- ``simple_one_for_one`` を使ったときは ``Supervisor.start_child`` を使って子側からリンクする
- ``Task.start_link`` で非同期で関数実行を行う。 ``Agent`` と異なり単なる結果を返す関数を実行する ``OTP``
- タイムアウト処理は ``Process.send_after`` で行い、 ``receive`` で受け取る

色々でてきて処理を追うのが大変でした。 ``IO.inspect`` とかでメッセージの表示順とかを見ると分かりやすいかもしれません。
