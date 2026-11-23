# 7.5 交接、编排、共享上下文

> 这一节要解决的问题：有的活做完要回到调度者，有的活做完就该由专家直接对用户说话。传给专家的事实怎么选，才不会把密钥和整段对话一起送过去？

示例代码：[examples/05-orchestration.ts](examples/05-orchestration.ts)

## 三种决定，差别在谁继续说话

编排者自己不干活。它每一步问一次 `route`，拿到三种决定之一：

| 决定       | 专家跑完之后           | 编排者           | 典型的活                 |
| ---------- | ---------------------- | ---------------- | ------------------------ |
| `delegate` | 一段文字记进笔记       | 继续问下一步     | 先搜索，再根据结果写作   |
| `handoff`  | 专家的回复就是最终回复 | 不再调用 `route` | 用户接下来该和这个专家聊 |
| `final`    | 没有专家               | 用自己的文字结束 | 信息够了，直接回答       |

委托把结果交还。交接把控制权交出去。混成一种"调用专家"，搜索专家的回复会直接面对用户，写作专家又没法看到搜索结果。示例里的决策列了三步，第二步是交接，第三步的 `final` 不会执行。打印出来是：

```text
delegate 搜索：找到 牛奶
handoff 写作
final 写完了
```

笔记里只有委托的那条 `搜索：找到 牛奶`。交接的回复在 `text` 里，不进笔记：控制权已经交出去了，编排者没有"下一步"要读这条笔记。

`maxSteps` 默认 4，数的是问 `route` 的次数。用尽了还没有 `final` 或 `handoff`，就停，文字是 `编排在 ${maxSteps} 步后停止，还没有最终回答`，已经记的笔记照样返回。没有这个上限，两个路由函数可以互相委托到把预算烧完。不是正整数就抛 `RangeError`，和别的"个数"参数一样，不要静默当成 4。

未知的专家名字抛 `未知的专家 "..."`。收成一段文字也能跑，但那是编排者写错了名字，不是专家的业务失败。写错名字应该在测试里响，而不是变成模型再试一次的材料。

每一步开始先 `signal?.throwIfAborted()`。已经取消了还去问 `route`，专家会在不该开始的时候开始。有 `signal` 才传给 `specialist.run` 的第三参。

## 把一个键过一遍 isSecretKey

允许名单里同时有这些键时，结果里该留谁，可以用第 6 章的规则在纸上算一遍。规范化是小写、去掉 `-` 和 `_`，再看 **结尾**：

| 键                                | 规范化        | 结果                                |
| --------------------------------- | ------------- | ----------------------------------- |
| `apiKey`                          | `apikey`      | 丢掉，以 `apikey` 结尾              |
| `api-key`                         | `apikey`      | 丢掉                                |
| `access_token`                    | `accesstoken` | 丢掉，以 `token` 结尾               |
| `inputTokens`                     | `inputtokens` | 留下，结尾是 `tokens`，不是 `token` |
| `maxTokens`                       | `maxtokens`   | 留下，同样的原因                    |
| `userId`，且 `deny` 里有 `UserId` | 不看后缀      | 丢掉，`deny` 不区分大小写           |

`includes("token")` 会把表里后三行里的 `inputTokens` 和 `maxTokens` 一起丢掉。练习断言 `inputTokens` 还在、`apiKey` 不在。把 `isSecretKey` 那一行删掉，这条测试会红。

## 交给专家的是副本

```ts
const decision = await options.route({ step, notes: [...notes] });
const context = Object.freeze({ ...options.context });
```

两处都是副本，原因不一样。

`notes` 是编排者还要继续改的数组。直接交给 `route`，路由函数 `push` 一条"伪造"，下一步和最终结果里都会有它。练习会改收到的那份，并检查最终 `notes` 里没有这条。`[...notes]` 是浅拷贝：元素是字符串，浅拷贝就够了。

`context` 冻结，是因为专家会把它留着。不冻结的话，专家 A 改了 `context.topic`，专家 B 看见的是改过的。`Object.freeze` 是浅的，值如果是对象还能改里面。这里的值规定是字符串，浅冻结就堵住了。

专家 **不会** 自动看见别的专家的笔记。笔记只在 `route` 的参数里。要让写作专家用上搜索结果，路由函数得把那句话写进 `task`。这和 7.4 节一样：默认隔离，显式传递。

## 允许名单，再加上已经写对的密钥判断

传给专家的事实用允许名单，而不是"除了这些都传"。名单是调用方点过名的键，顺序也跟名单走，重复的键只留第一次。值不是字符串的丢掉，不要 `String(3)`：数字变成 `"3"` 之后，接收方分不清这是一段事实还是一个计数。键名大小写敏感，`allow` 里写 `note`，`facts` 里只有 `Note`，就是没有这条。

密钥还要再挡一层。人会把 `apiKey` 写进允许名单。第 6 章的 `isSecretKey` 已经把这件事做对了：

```ts
const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");
return SECRET_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
```

`apiKey`、`api_key`、`access_token` 会被丢掉。`inputTokens` 规范化之后是 `inputtokens`，以 `tokens` 结尾，不以 `token` 结尾，**留着**。如果写成 `key.toLowerCase().includes("token")`，`inputTokens` 也会被丢掉，用量这种无害的数字进不了上下文。后缀而不是包含，是 6.8 节专门写过的坑，这里直接调用那个函数，不另写一条正则。

`deny` 是额外的业务键，比如用户 id。这一项大小写不敏感：名单里写 `UserId`，事实的键是 `userId`，也丢掉。示例的输出是 `shared note,inputTokens`，`apiKey` 虽然在允许名单里，不在结果里。

返回的是新对象。调用方之后改 `facts.note`，已经交出去的那份不变。专家改返回值，下一次 `shareContext` 也不该看见。

示例里的三步决策可以对照着循环读。第一步 `delegate` 搜索，笔记变成 `["搜索：找到 牛奶"]`，步数还没用尽，继续。第二步 `handoff` 写作，函数在这里返回：`text` 是写作的回复，`handoff` 是 `"写作"`，`steps` 是 2，笔记仍然只有搜索那一条。第三步的 `final` 不在返回值里，因为 `route` 没有被第三次调用。把交接写成"记完笔记再继续问"，第三步会执行，`handoff` 也不会被设置，练习里"交接立刻结束"那条对不上。

## 停下来想一想

1. 搜索用委托、写作用交接。用户最后看到的是谁的文字？搜索的结果在不在 `notes` 里？
2. 允许名单里有 `inputTokens` 和 `apiKey`。用"包含 `token`"的判断，哪一个会被误伤？`isSecretKey` 呢？

`route` 拿到的 `notes` 在练习里会被 `push("伪造")`。最终结果里不能有这个词，而且两次调用拿到的数组不能是同一个。冻结那份数组会让 `push` 抛错，测试同样过不了：规格要的是一份可修改的副本，不是一份只读的原数组。

## 小结

- 委托把结果交还编排者；交接把控制权交出去，编排者不再问 `route`
- 步数用尽要停，并带上已经记的笔记。未知专家是编程错误，抛出去
- 交给 `route` 的笔记是副本；交给专家的 context 是冻结的副本。笔记不会自动变成下一个专家的输入
- 共享用允许名单。密钥用 `isSecretKey`（看后缀），不要用"包含 token"

## 练习

[exercises/07-extensions/05-orchestration.ts](../../exercises/07-extensions/05-orchestration.ts)：实现 `shareContext` 和 `orchestrate`。运行 `pnpm ex 05-orchestration`。

下一节：[7.6 记忆：折叠和长期存储](06-memory.md)
