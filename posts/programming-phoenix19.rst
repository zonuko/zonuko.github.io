---
date: 2017-02-14 21:52
tags:
  - phoenix
  - elixir
  - programming
description: Programming Phoenixって本を読むその19
title: Programming Phoenix勉強その19
slug: programming-phoenix19
related_posts: programming-phoenix18
---


Programming Phoenix勉強その19
################################

その19です。ここからChapter12です。今まで作った ``InfoSys`` アプリとかを
アンブレラプロジェクトに変更してテストしやすくするみたいです。

============================================
rumbrellaプロジェクトの作成と設定
============================================

以下のコマンドでアンブレラプロジェクトを新たに生成します。
既存の ``rumbl`` プロジェクトと混じらないように適当な場所で実行します。

.. code-block:: shell

   $ mix new rumbrella --umbrella

アンブレラプロジェクトが作成されたので、 ``cd rumbrella/app`` に移動して以下のコマンドを実行します。

.. code-block:: shell

   app $ mix new info_sys

準備が出来たので既存の ``Rumbl.InfoSys`` と ``Rumbl`` を ``rumbrella`` 管理下に移植していきます。
まず ``Rumbl.InfoSys`` からやっていきます。以下の流れです。


.. TODO: 以下番号付きリストはパーサー側が対応してない
.. #. ``Rumbl.InfoSys`` のモジュール名を ``InfoSys`` に変更して、 ``lib/rumbl/info_sys.ex`` を ``app`` フォルダで作成した ``info_sys/lib/info_sys.ex`` となるように移動します。
.. #. ``Rumbl.InfoSys.Supervisor`` も同じようにリネームして ``info_sys/lib/info_sys/supervisor.ex`` となるように移動します。
.. #. ``Rumbl.InfoSys.Wolfram`` も ``supervisor`` と同じようにして同じフォルダに移動します。
.. #. ``Rumbl.InfoSys`` となっている箇所をすべて ``InfoSys`` に置換します。
.. #. ``Wolfram Alpha`` のAPIキーを取得する関数を以下のように変更します。

- ``Rumbl.InfoSys`` のモジュール名を ``InfoSys`` に変更して、 ``lib/rumbl/info_sys.ex`` を ``app`` フォルダで作成した ``info_sys/lib/info_sys.ex`` となるように移動します。
- ``Rumbl.InfoSys.Supervisor`` も同じようにリネームして ``info_sys/lib/info_sys/supervisor.ex`` となるように移動します。
- ``Rumbl.InfoSys.Wolfram`` も ``supervisor`` と同じようにして同じフォルダに移動します。
- ``Rumbl.InfoSys`` となっている箇所をすべて ``InfoSys`` に置換します。
- ``Wolfram Alpha`` のAPIキーを取得する関数を以下のように変更します。

.. code-block:: Elixir

   defp app_id, do: Application.get_env(:info_sys, :wolfram)[:app_id]

- 依存関係を移し替えておきます。 ``info_sys`` の ``mix.exs`` の ``deps`` に ``{:sweet_xml, "~> 0.5.0"}`` を追加します。

これで ``InfoSys`` の移動は完了です。以下を実行しておきます。

.. code-block:: shell

   rumbrella $ mix deps.get
   rumbrella $ mix test

次は ``Rumbl`` 本体の移植を行います。

============================================
Rumblプロジェクトのrumbrellaへの移植
============================================

``Rumbl`` プロジェクトを ``rumbrella`` に移植します。


- ``rumbl`` ディレクトリを ``rumbrella/apps`` 以下に移動します。
- ``rumbl`` の ``mix.exs`` 内の ``project`` 関数に ``info_sys`` の ``mix.exs`` と合わせるような感じで以下を追加します。

.. code-block:: Elixir

   def project do
     [app: :rumbl,
      version: "0.0.1",
      elixir: "~> 1.2",
      elixirc_paths: elixirc_paths(Mix.env),
      compilers: [:phoenix, :gettext] ++ Mix.compilers,
      build_embedded: Mix.env == :prod,
      start_permanent: Mix.env == :prod,
      aliases: aliases(),
      build_path: "../../_build",
      config_path: "../../config/config.exs",
      deps_path: "../../deps",
      lockfile: "../../mix.lock",
      deps: deps()]
   end

3. ``mix.exs`` の ``application`` 関数に ``:info_sys`` を追加します。 ``:comeonin`` の後に追加する感じです。
- ``deps`` の ``:sweet_xml`` を削除して ``{:info_sys, in_umbrella: true}`` を追加します。
- ``lib/rumbl.ex`` から ``children`` として追加していた ``Rumbl.InfoSys`` を削除します。
- ``video_channel.ex`` で使っていた ``Rumbl.InfoSys`` を ``InfoSys`` に変更します。
- ``dev.secret.exs`` の ``WolframAlpha`` のキー部分を ``:rumbl`` から ``:info_sys`` に変更します。

これで準備OKです。

最後に ``mix deps.get`` と ``mix test`` を実行しておきます。

============================================
OTPのテスト
============================================

ここで終わると短いので、このまま ``chapter13`` に入って ``OTP`` のテストを行います。
自動で生成されている　 ``info_sys_test.exs`` を以下のように変更します。

.. code-block:: Elixir

   defmodule InfoSysTest do
     use ExUnit.Case
     alias InfoSys.Result
     
     defmodule TestBackend do
       def start_link(query, ref, owner, limit) do
         Task.start_link(__MODULE__, :fetch, [query, ref, owner, limit])
       end
   
       def fetch("result", ref, owner, _limit) do
         send(owner, {:results, ref, [%Result{backend: "test", text: "result"}]})
       end
   
       def fetch("none", ref, owner, _limit) do
         send(owner, {:results, ref, []})
       end
   
       def fetch("timeout", _ref, owner, _limit) do
         # プロセス監視用にテスト実行元にpidを送る
         send(owner, {:backend, self()})
         :timer.sleep(:infinity)
       end
   
       def fetch("boom", _ref, _owner, _limit) do
         raise "boom!"
       end
     end
   
     test "compute/2 with backend results" do
       assert [%Result{backend: "test", text: "result"}] =
              InfoSys.compute("result", backends: [TestBackend])
     end
   
     test "compute/2 with no backend results" do
       assert [] = InfoSys.compute("none", backends: [TestBackend])
     end
   
     test "compute/2 with timeout returns no results and kills workers" do
       results = InfoSys.compute("timeout", backends: [TestBackend], timeout: 10)
       assert results == []
       # 上のfetch("timeout", 〜) 関数から送られてくるPID
       assert_receive {:backend, backend_pid}
   
       ref = Process.monitor(backend_pid)
       assert_receive {:DOWN, ^ref, :process, _pid, _reason}
       # receivedはすでに受信ボックスに入っているものを取り出す
       # 受信をまったりはしない
       refute_received {:DOWN, _, _, _, _}
       refute_received :timeout
     end
   
     @tag :capture_log
     test "compute/2 discards backend errors" do
       assert InfoSys.compute("boom", backends: [TestBackend]) == []
       
       refute_received {:DOWN, _, _, _, _}
       refute_received :timeout
     end
   end

- ``wolfram`` などのバックエンドAPIの代わりとなるモジュールを内部に定義しています。
- タイムアウトの処理は ``assert_receive`` や ``refute_received`` を使ってタイムアウト時のメッセージを受け取ることで行っています。
- 例外発生時のテストも似たような感じですが、普通にやるとコンソールにエラーメッセージが表示されると出 ``@tag :capture_log`` で制御しています。

今までのテストとそう変わったところは無いかと思います。

============================================
Wolfram APIの分離
============================================

現状の ``Wolfram API`` は ``:httpc`` がハードコーディングされており、こいつを使うことが前提になっています。
これだとテストが難しいのでまずはこの取得先設定を外部ファイルにします。 ``wolfram.ex`` を変更します。

.. code-block:: Elixir

   @http Application.get_env(:info_sys, :wolfram)[:http_client] || :httpc
 
   defp fetch_xml(query_str) do
     {:ok, {_, _, body}} = @http.request(
       String.to_char_list("http://api.wolframalpha.com/v2/query" <> "?appid=#{app_id()}" <>
                                                                     "&input=#{URI.encode_www_form(query_str)}&format=plaintext"))
     body
   end

接続に使うモジュールを ``@http`` と言うかたちで ``config`` 系統のファイルに外出しました。
また、 ``URI.eocode_www_form`` にしています。

外部ファイルを作ります。 ``config/text.exs`` を作ります。

.. code-block:: Elixir

   use Mix.Config
   
   config :info_sys, :wolfram,
     app_id: "1234",
     http_client: InfoSys.Test.HTTPClient

環境によって動的に設定ファイルを読み込むように ``config.exs`` の ``import_config "#{Mix.env}.exs"`` のコメントを外しておきます。

テスト以外の環境でも外部ファイルが必要となるので、 ``use Mix.Config`` だけ書いた 
``dev.exs`` と ``prod.exs`` を作っておきます。

次にテスト用のXMLデータを持ってきます。 `本の公式サイトのソース置き場 <https://pragprog.com/titles/phoenix/source_code>`_
からソースを持ってきて ``test/fixtures`` フォルダに ``wolfram.xml`` ファイルを設置しておきます。

``http`` のクライアントも作ります。 ``test/backends/http_client.exs`` を以下の内容で作ります。

.. code-block:: Elixir

   defmodule InfoSys.Test.HTTPClient do
     @wolfram_xml File.read!("test/fixtures/wolfram.xml")
   
     def request(url) do
       url = to_string(url)
   
       cond do
         String.contains?(url, "1+%2B+1") -> {:ok, {[], [], @wolfram_xml}}
         true -> {:ok, {[], [], "<queryresult></queryresult>"}}
       end
     end
   end

``test_helper.exs`` にこの外部ファイル化したモジュールが読み込まれていることを確認する設定を書きます。

.. code-block:: Elixir

   Code.require_file "backends/http_client.exs", __DIR__
   
   ExUnit.start()

``rumbl`` の方にも似たように書きます。

.. code-block:: Elixir

   Code.require_file "../../info_sys/test/backends/http_client.exs", __DIR__
   
   ExUnit.start
   
   Ecto.Adapters.SQL.Sandbox.mode(Rumbl.Repo, :manual)

ここまで来てやっと最後にテストを書きます。 ``test/backends/woldram_test.exs`` です。

.. code-block:: Elixir

   defmodule InfoSys.Backends.WolframTest do
     use ExUnit.Case, async: true
     alias InfoSys.Wolfram
   
     test "makes request, reports results, them terminates" do
       ref = make_ref()
       {:ok, pid} = Wolfram.start_link("1 + 1", ref, self(), 1)
       Process.monitor(pid)
   
       assert_receive {:results, ^ref, [%InfoSys.Result{text: "2"}]}
       assert_receive {:DOWN, _ref, :process, ^pid, :normal}
     end
   
     test "no query results reports an empty list" do
       ref = make_ref()
       {:ok, _} = Wolfram.start_link("none", ref, self(), 1)
   
       assert_receive {:results, ^ref, []}
     end
   end

これで基本的なテストはOKです。


============================================
まとめ
============================================

- ``umbrella`` プロジェクトを使うことでAPI同士の結合を弱めて、テストがやりやすくなる。
- テストをする際はスタブとなるような構造体などを作ってやると良い

