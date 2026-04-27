一、总体设计思路
语音房后台服务主要承担三类职责：用户与房间的元数据管理、房间生命周期管理、与ZEGO SDK的对接（房间状态同步、麦位管理等）。ZEGO方案中，后台业务服务主要负责维护房间列表、房间成员角色、麦位状态等数据，ZEGO官方也提供了通过回调维护房间列表的参考方案。

技术栈建议：

层次	技术选型
运行环境	Node.js + TypeScript
数据库	MySQL（主从+读写分离）
缓存	Redis（热数据、房间状态）
存储	对象存储（用户头像等）
典型的语音房功能包括：房间管理（创建/销毁/列表/配置）、麦位管理（上麦/下麦/禁麦/锁麦）、IM即时通讯（消息广播/礼物同步）、礼物打赏与收益结算等。

二、表结构设计
1. 用户表（user）
存储用户基本信息，是整个系统的基础。

sql
CREATE TABLE `user` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `uid` varchar(64) NOT NULL COMMENT '业务用户ID',
  `nickname` varchar(64) NOT NULL COMMENT '昵称',
  `avatar` varchar(512) DEFAULT NULL COMMENT '头像URL',
  `gender` tinyint DEFAULT 0 COMMENT '性别 0未知 1男 2女',
  `level` int DEFAULT 0 COMMENT '用户等级',
  `status` tinyint DEFAULT 1 COMMENT '状态 0禁用 1正常',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_uid` (`uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';
2. 房间表（room）
存储房间基本信息，是语音房的核心实体。

sql
CREATE TABLE `room` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `room_id` varchar(64) NOT NULL COMMENT '房间ID（与ZEGO roomID一致）',
  `title` varchar(128) NOT NULL COMMENT '房间标题',
  `cover_url` varchar(512) DEFAULT NULL COMMENT '房间封面URL',
  `announcement` varchar(512) DEFAULT NULL COMMENT '房间公告',
  `type` tinyint DEFAULT 0 COMMENT '房间类型 0公开 1私密',
  `password` varchar(32) DEFAULT NULL COMMENT '私密房间密码（仅type=1时有效）',
  `owner_id` varchar(64) NOT NULL COMMENT '房主uid',
  `owner_nickname` varchar(64) DEFAULT NULL COMMENT '房主昵称（冗余）',
  `status` tinyint DEFAULT 0 COMMENT '房间状态 0空闲 1进行中 2已关闭',
  `seat_count` int DEFAULT 9 COMMENT '麦位数量（含主播位）',
  `current_online` int DEFAULT 0 COMMENT '当前在线人数',
  `current_mic_users` int DEFAULT 0 COMMENT '当前麦上人数',
  `started_at` datetime DEFAULT NULL COMMENT '开播时间',
  `ended_at` datetime DEFAULT NULL COMMENT '结束时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_room_id` (`room_id`),
  KEY `idx_owner_id` (`owner_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='房间表';
说明：room_id需与ZEGO房间ID保持一致，后台通过ZEGO回调维护房间状态时以此关联。

3. 房间成员表（room_member）
记录房间内的用户信息及麦位状态。

sql
CREATE TABLE `room_member` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `room_id` varchar(64) NOT NULL COMMENT '房间ID',
  `uid` varchar(64) NOT NULL COMMENT '用户uid',
  `nickname` varchar(64) DEFAULT NULL COMMENT '用户昵称（冗余）',
  `avatar` varchar(512) DEFAULT NULL COMMENT '用户头像（冗余）',
  `role` tinyint DEFAULT 0 COMMENT '角色 0听众 1房主 2管理员 3麦上听众',
  `seat_index` int DEFAULT -1 COMMENT '麦位索引，-1表示不在麦上',
  `mic_status` tinyint DEFAULT 0 COMMENT '麦克风状态 0关麦 1开麦',
  `join_time` datetime DEFAULT NULL COMMENT '进入房间时间',
  `leave_time` datetime DEFAULT NULL COMMENT '离开房间时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_room_uid` (`room_id`, `uid`),
  KEY `idx_room_id` (`room_id`),
  KEY `idx_uid` (`uid`),
  KEY `idx_seat_index` (`room_id`, `seat_index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='房间成员表';
注意：seat_index表示用户在哪个麦位。ZEGO房间属性功能支持以Key-Value形式存储麦位信息。

4. 麦位状态表（seat_state）
麦位信息高频变化，建议用Redis存储实时状态，MySQL仅作持久化备份。

sql
CREATE TABLE `seat_state` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `room_id` varchar(64) NOT NULL COMMENT '房间ID',
  `seat_index` int NOT NULL COMMENT '麦位索引（从1开始）',
  `uid` varchar(64) DEFAULT NULL COMMENT '占用该麦位的用户uid，空表示空闲',
  `nickname` varchar(64) DEFAULT NULL COMMENT '用户昵称（冗余）',
  `status` tinyint DEFAULT 0 COMMENT '麦位状态 0空闲 1占用 2锁定 3禁麦',
  `mic_enabled` tinyint DEFAULT 1 COMMENT '是否允许开麦',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_room_seat` (`room_id`, `seat_index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='麦位状态表';

. 礼物配置表（gift）
定义礼物类型和价格。

sql
CREATE TABLE `gift` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '礼物ID',
  `name` varchar(64) NOT NULL COMMENT '礼物名称',
  `icon_url` varchar(512) DEFAULT NULL COMMENT '礼物图标URL',
  `animation_url` varchar(512) DEFAULT NULL COMMENT '礼物动画URL',
  `price` decimal(10,2) NOT NULL DEFAULT 0.00 COMMENT '礼物价格（单位：元或钻石）',
  `type` tinyint DEFAULT 0 COMMENT '礼物类型',
  `sort_order` int DEFAULT 0 COMMENT '排序权重',
  `status` tinyint DEFAULT 1 COMMENT '状态 0下架 1上架',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='礼物配置表';
6. 礼物记录表（gift_record）
记录用户送礼明细，用于收益结算和数据统计。

sql
CREATE TABLE `gift_record` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `room_id` varchar(64) NOT NULL COMMENT '房间ID',
  `from_uid` varchar(64) NOT NULL COMMENT '送礼人uid',
  `to_uid` varchar(64) NOT NULL COMMENT '收礼人uid（麦上用户）',
  `gift_id` bigint unsigned NOT NULL COMMENT '礼物ID',
  `gift_name` varchar(64) DEFAULT NULL COMMENT '礼物名称（冗余）',
  `price` decimal(10,2) NOT NULL COMMENT '单价',
  `quantity` int DEFAULT 1 COMMENT '数量',
  `total_amount` decimal(10,2) NOT NULL COMMENT '总金额',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_room_id` (`room_id`),
  KEY `idx_from_uid` (`from_uid`),
  KEY `idx_to_uid` (`to_uid`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='礼物记录表';
7. 聊天消息表（message_log）
IM消息记录，建议分库分表或使用专门的日志存储。

sql
CREATE TABLE `message_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `room_id` varchar(64) NOT NULL COMMENT '房间ID',
  `from_uid` varchar(64) NOT NULL COMMENT '发送人uid',
  `from_nickname` varchar(64) DEFAULT NULL COMMENT '发送人昵称（冗余）',
  `message_type` tinyint DEFAULT 0 COMMENT '消息类型 0文本 1礼物 2系统通知',
  `content` text COMMENT '消息内容',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_room_id` (`room_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天消息表';
8. 用户操作记录表（user_action_log）
用于风控和审计。

sql
CREATE TABLE `user_action_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uid` varchar(64) NOT NULL COMMENT '用户uid',
  `action` varchar(32) NOT NULL COMMENT '操作类型（create_room/join_room/leave_room/send_gift）',
  `room_id` varchar(64) DEFAULT NULL COMMENT '关联房间ID',
  `target_uid` varchar(64) DEFAULT NULL COMMENT '目标用户uid',
  `extra` json DEFAULT NULL COMMENT '额外参数',
  `ip` varchar(64) DEFAULT NULL COMMENT '客户端IP',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_uid` (`uid`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户操作记录表';
9. 举报与封禁表（report）
用于内容风控管理。

sql
CREATE TABLE `report` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `room_id` varchar(64) NOT NULL COMMENT '房间ID',
  `reporter_uid` varchar(64) NOT NULL COMMENT '举报人uid',
  `target_uid` varchar(64) NOT NULL COMMENT '被举报人uid',
  `reason` varchar(255) DEFAULT NULL COMMENT '举报原因',
  `status` tinyint DEFAULT 0 COMMENT '处理状态 0待处理 1已驳回 2已封禁',
  `handler_uid` varchar(64) DEFAULT NULL COMMENT '处理人',
  `handle_remark` varchar(255) DEFAULT NULL COMMENT '处理备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_room_id` (`room_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='举报与封禁表';
三、ER关系图
text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    user     │     │    room     │     │   gift     │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ id (PK)     │◄────│ owner_id    │     │ id (PK)     │
│ uid (UK)    │     │ room_id (UK)│     │ name        │
│ nickname    │     │ title       │     │ price       │
│ avatar      │     │ status      │     │ ...         │
│ ...         │     │ ...         │     └──────┬──────┘
└──────┬──────┘     └──────┬──────┘            │
       │                   │                   │
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│room_member  │     │ seat_state  │     │gift_record  │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ room_id     │     │ room_id     │     │ room_id     │
│ uid         │     │ seat_index  │     │ from_uid    │
│ role        │     │ uid         │     │ to_uid      │
│ seat_index  │     │ status      │     │ gift_id     │
│ mic_status  │     │ ...         │     │ total_amount│
└─────────────┘     └─────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│message_log  │     │user_action  │     │   report    │
├─────────────┤     │    _log     │     ├─────────────┤
│ room_id     │     ├─────────────┤     │ room_id     │
│ from_uid    │     │ uid         │     │ reporter_uid│
│ content     │     │ action      │     │ target_uid  │
│ ...         │     │ room_id     │     │ reason      │
└─────────────┘     │ extra       │     │ status      │
                    └─────────────┘     └─────────────┘
四、与ZEGO集成关键点
4.1 房间生命周期同步
ZEGO通过回调通知房间创建和销毁，后台需根据room_id、room_session_id和room_create_time维护本地房间列表，解决回调乱序问题。

typescript
// 接收 ZEGO 房间创建回调
app.post('/zego/callback/room_create', async (req, res) => {
  const { room_id, room_session_id, room_create_time } = req.body;
  // 根据 session_id 和 create_time 判断是否已有记录，防止乱序覆盖
  await syncRoomStatus(room_id, room_session_id, room_create_time);
  res.json({ code: 0 });
});
4.2 麦位管理
ZEGO房间属性功能支持以Key-Value形式存储房间状态：

每个房间最多20个属性

Key长度上限16字节，Value上限1024字节

总长度不超过5120字节

麦位状态建议由ZIM SDK实时同步，后台通过监听房间属性变化来更新MySQL/Redis中的状态。

4.3 角色定义
ZEGO语音房方案中，角色定义如下：

角色	说明
房主（Host）	创建房间的用户，自动上麦，拥有最高管理权限
麦上听众（Guest Speaker）	被邀请或申请上麦的用户，可与房主及麦上其他用户互动
麦下听众（Listener）	仅收听，不参与发言
4.4 心跳与状态维护
用户进入房间后需维持心跳，后台定期清理超时用户，更新房间在线人数。

五、缓存设计（Redis）
Key模式	类型	说明	TTL
room:{roomId}:info	Hash	房间基本信息缓存	房间生命周期
room:{roomId}:seats	Hash	麦位实时状态	房间生命周期
room:{roomId}:members	Set	房间内在线用户ID集合	房间生命周期
room:{roomId}:waiting_queue	List	麦位等待队列（麦序模式）	房间生命周期
room:{roomId}:seat_lock:{seatIndex}	String	麦位操作分布式锁	5秒
user:{uid}:online	String	用户在线状态（含房间ID）	60秒
缓存与数据库一致性：以缓存为主，数据库异步持久化。房间销毁时同步清理缓存，用户上下麦优先更新Redis，通过定时任务或消息队列同步至MySQL。

六、扩展建议
分表策略：message_log和gift_record按时间分表（如按月或按周），避免单表数据过大

索引优化：高频查询字段（如room.status、room_member.uid）确保有覆盖索引

读写分离：报表类查询走从库，核心写入操作走主库

监控告警：建议配置慢查询日志、Redis命中率监控和房间状态异常告警

好的，在现有语音房服务基础上增加评论功能，支持用户对房间进行评论、回复、点赞。下面给出表结构设计及相关说明。

一、评论功能需求概述
用户可以对某个房间发表一级评论

用户可以对一级评论进行回复（形成二级评论，暂不考虑更深的嵌套）

可以对评论（包括回复）进行点赞，同一用户对同一条评论只能点赞一次

展示评论的点赞数量、回复数量

支持按发布时间倒序、热度（点赞数）排序

后台可管理评论（审核、删除、置顶等）

设计原则：评论主体是“房间”，因此所有评论均关联到 room_id。为了简化层级，采用 parent_id 字段区分一级评论和回复，parent_id = 0 表示一级评论，非0表示回复哪个评论。这样一张表即可支持两级评论，避免多表联查。

二、新增表结构
1. 评论主表（comment）
存储所有评论和回复内容。

sql
CREATE TABLE `comment` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '评论ID',
  `room_id` varchar(64) NOT NULL COMMENT '所属房间ID',
  `parent_id` bigint unsigned NOT NULL DEFAULT 0 COMMENT '父评论ID，0表示一级评论',
  `uid` varchar(64) NOT NULL COMMENT '发表评论的用户uid',
  `nickname` varchar(64) DEFAULT NULL COMMENT '用户昵称（冗余，防止用户改名后评论显示旧名）',
  `avatar` varchar(512) DEFAULT NULL COMMENT '用户头像（冗余）',
  `content` text NOT NULL COMMENT '评论内容（纯文本或富文本，根据业务决定）',
  `like_count` int unsigned NOT NULL DEFAULT 0 COMMENT '点赞数',
  `reply_count` int unsigned NOT NULL DEFAULT 0 COMMENT '回复数（仅一级评论维护，减少实时统计）',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态 0已删除/审核不通过 1正常 2置顶',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_room_parent` (`room_id`, `parent_id`),   -- 查询某个房间的一级评论
  KEY `idx_room_created` (`room_id`, `created_at`), -- 按时间排序
  KEY `idx_room_like` (`room_id`, `like_count`),    -- 按热度排序
  KEY `idx_parent_id` (`parent_id`),                -- 查询某个评论的所有回复
  KEY `idx_uid` (`uid`)                             -- 查询用户的所有评论
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='评论表';
字段说明：

parent_id = 0 表示一级评论，否则表示对哪个评论的回复

reply_count 只在一级评论上维护（回复数），回复本身不再记录子回复（如需多级嵌套可自行扩展，但会增加复杂度）

like_count 定期统计或通过触发器/应用层维护

nickname、avatar 冗余存储，避免用户修改资料后历史评论显示异常（可根据业务决定是否实时关联 user 表）

2. 评论点赞记录表（comment_like）
记录用户对评论的点赞行为，防止重复点赞。

sql
CREATE TABLE `comment_like` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `comment_id` bigint unsigned NOT NULL COMMENT '评论ID',
  `uid` varchar(64) NOT NULL COMMENT '点赞用户uid',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '点赞时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_comment_user` (`comment_id`, `uid`),  -- 保证同一用户对同一条评论只能点赞一次
  KEY `idx_uid` (`uid`),
  KEY `idx_comment_id` (`comment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='评论点赞记录表';
点赞记录通常只需要存在即可，不需要 status 字段；如果允许取消点赞，则删除该记录即可。comment 表中的 like_count 可以通过定时任务或触发器同步更新。

三、ER 关系图（局部）
text
┌─────────────┐       ┌─────────────┐
│    room     │       │    user     │
├─────────────┤       ├─────────────┤
│ room_id (PK)│       │ uid (PK)    │
└──────┬──────┘       └──────┬──────┘
       │                     │
       │ 1                n  │
       ▼                     ▼
┌─────────────────────────────────┐
│            comment              │
├─────────────────────────────────┤
│ id (PK)                         │
│ room_id (FK → room.room_id)     │
│ parent_id (FK → comment.id)     │
│ uid (FK → user.uid)             │
│ content                         │
│ like_count                      │
│ reply_count                     │
│ status                          │
│ created_at                      │
└───────────────┬─────────────────┘
                │
                │ 1
                │
                ▼
       ┌─────────────────┐
       │  comment_like   │
       ├─────────────────┤
       │ comment_id (FK) │
       │ uid             │
       │ created_at      │
       └─────────────────┘
四、常用查询 SQL 示例
1. 查询某个房间的一级评论（分页，按时间倒序）
sql
SELECT id, uid, nickname, avatar, content, like_count, reply_count, created_at
FROM comment
WHERE room_id = ? AND parent_id = 0 AND status = 1
ORDER BY created_at DESC
LIMIT ? OFFSET ?;
2. 查询某个评论的回复列表（分页）
sql
SELECT id, uid, nickname, avatar, content, like_count, created_at
FROM comment
WHERE parent_id = ? AND status = 1
ORDER BY created_at ASC
LIMIT ? OFFSET ?;
3. 点赞（事务）
sql
-- 插入点赞记录（若重复插入则 UNIQUE 约束报错）
INSERT INTO comment_like (comment_id, uid) VALUES (?, ?);

-- 更新评论表的点赞计数
UPDATE comment SET like_count = like_count + 1 WHERE id = ?;
4. 取消点赞
sql
DELETE FROM comment_like WHERE comment_id = ? AND uid = ?;
UPDATE comment SET like_count = like_count - 1 WHERE id = ?;
5. 发布一级评论
sql
INSERT INTO comment (room_id, parent_id, uid, nickname, avatar, content)
VALUES (?, 0, ?, ?, ?, ?);
-- 同时更新房间表的评论数（如果 room 表需要 total_comment_count 字段）
6. 发布回复
sql
-- 插入回复
INSERT INTO comment (room_id, parent_id, uid, nickname, avatar, content)
VALUES (?, ?, ?, ?, ?, ?);

-- 增加父评论的 reply_count
UPDATE comment SET reply_count = reply_count + 1 WHERE id = ?;
五、缓存与性能优化建议
评论列表热数据：可使用 Redis 缓存前 N 页（如首页 20 条），设置合理过期时间（如 5 分钟），缓存失效后回源数据库。

点赞计数：采用 Redis 的 INCR 维护实时点赞数，定时同步到 MySQL（如每分钟或每 10 条变更触发一次）。

深度分页优化：当评论数量很大时，避免 OFFSET 过大，改用 WHERE id < last_id 的游标分页方式。

读写分离：评论查询走从库，写入操作走主库。

六、扩展考虑（可选）
评论审核：若需要内容审核，可在 comment 表增加 audit_status 字段（待审核/通过/拒绝），默认先审后发或先发后审。

评论举报：可复用已有的 report 表，新增 report_type = 'comment'，并关联 comment_id。

@ 提及用户：需要解析评论内容中的 @[uid]，并建立 comment_mention 表记录被提及的用户。

图片/表情评论：若需要支持图片，可增加 comment_attachment 表或直接存储 URL 数组（JSON 字段）。

