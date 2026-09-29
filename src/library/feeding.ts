/* ============================================================================
 *  喂养素材库 · Feeding
 * ----------------------------------------------------------------------------
 *  FOODS              常见辅食食材：起始月龄、分组、是否常见过敏原、一句话要点
 *  RECIPES            辅食食谱：质地随月龄递进 泥糊 → 碎末 → 颗粒/小块 → 软烂家常
 *  FEEDING_PRINCIPLES 通用喂养原则
 *
 *  参考《中国居民膳食指南（2022）》婴幼儿喂养部分；个体差异以儿保医生建议为准。
 *  分组说明：bean 对应膳食指南中的"大豆及坚果类"，坚果只以粉/酱形式出现。
 * ========================================================================== */

import type { Food, Recipe } from './types'

/* ── 食材 ───────────────────────────────────────────────────────────────── */

export const FOODS: Food[] = [
  // 谷薯类
  { name: '高铁米粉', min: 6, group: 'grain', allergen: false, tip: '推荐的第一口辅食，用温水调成稀糊，逐渐加稠' },
  { name: '大米粥', min: 6, group: 'grain', allergen: false, tip: '先煮成烂粥打细，再逐步过渡到稠粥、软饭' },
  { name: '小米粥', min: 6, group: 'grain', allergen: false, tip: '易消化，可与南瓜、山药同煮' },
  { name: '燕麦', min: 7, group: 'grain', allergen: false, tip: '选无添加的纯燕麦片，煮烂后打碎' },
  { name: '婴儿面条', min: 7, group: 'grain', allergen: true, tip: '含小麦，首次添加注意观察；煮烂剪成小段' },
  { name: '玉米', min: 8, group: 'grain', allergen: false, tip: '外皮难消化，需打成糊；整粒玉米易呛噎' },
  { name: '软米饭', min: 10, group: 'grain', allergen: false, tip: '比大人的饭多加水，煮得更软烂' },
  { name: '馒头', min: 10, group: 'grain', allergen: true, tip: '含小麦，撕成小块作手指食物，泡软更易吞咽' },
  { name: '馄饨', min: 12, group: 'grain', allergen: true, tip: '皮薄馅嫩，剪成小块再喂' },

  // 蔬菜类
  { name: '南瓜', min: 6, group: 'veg', allergen: false, tip: '味甜易接受，蒸熟压泥' },
  { name: '胡萝卜', min: 6, group: 'veg', allergen: false, tip: '蒸软打泥，熟练后与肉泥搭配更利于吸收' },
  { name: '西兰花', min: 6, group: 'veg', allergen: false, tip: '取花冠部分蒸软打泥' },
  { name: '西葫芦', min: 6, group: 'veg', allergen: false, tip: '去皮去籽蒸软，口感清淡' },
  { name: '土豆', min: 6, group: 'veg', allergen: false, tip: '蒸熟压泥，可与其他蔬菜混合' },
  { name: '红薯', min: 6, group: 'veg', allergen: false, tip: '富含膳食纤维，有助于预防便秘' },
  { name: '紫薯', min: 7, group: 'veg', allergen: false, tip: '蒸熟压泥，颜色鲜艳能吸引宝宝' },
  { name: '山药', min: 7, group: 'veg', allergen: false, tip: '大人去皮时戴手套防止手痒，蒸熟压泥' },
  { name: '菠菜', min: 7, group: 'veg', allergen: false, tip: '先焯水去除草酸，再打泥或切碎' },
  { name: '小白菜', min: 7, group: 'veg', allergen: false, tip: '取菜叶焯水后切碎' },
  { name: '豌豆', min: 7, group: 'veg', allergen: false, tip: '去皮打泥，整粒容易呛噎' },
  { name: '冬瓜', min: 7, group: 'veg', allergen: false, tip: '水分多，适合做蔬菜羹' },
  { name: '番茄', min: 8, group: 'veg', allergen: false, tip: '去皮去籽，偏酸，可与其他食物搭配' },
  { name: '白萝卜', min: 8, group: 'veg', allergen: false, tip: '煮软后切碎，可做汤' },
  { name: '卷心菜', min: 8, group: 'veg', allergen: false, tip: '煮软后切碎，一次不宜过多以免胀气' },
  { name: '茄子', min: 10, group: 'veg', allergen: false, tip: '去皮蒸软，切碎拌饭' },
  { name: '香菇', min: 10, group: 'veg', allergen: false, tip: '切碎煮烂，天然提鲜' },
  { name: '莲藕', min: 10, group: 'veg', allergen: false, tip: '煮至软烂后切碎或打碎' },
  { name: '黄瓜', min: 10, group: 'veg', allergen: false, tip: '去皮去籽切碎，或蒸软切条作手指食物' },

  // 水果类（蜂蜜无更合适的分组，暂归此处，重点在月龄限制）
  { name: '苹果', min: 6, group: 'fruit', allergen: false, tip: '蒸熟打泥更易消化；1岁前不给整块生苹果' },
  { name: '香蕉', min: 6, group: 'fruit', allergen: false, tip: '熟透的香蕉直接压泥即可' },
  { name: '牛油果', min: 6, group: 'fruit', allergen: false, tip: '富含优质脂肪，压泥即可' },
  { name: '梨', min: 6, group: 'fruit', allergen: false, tip: '蒸熟打泥，有助于缓解便秘' },
  { name: '木瓜', min: 7, group: 'fruit', allergen: false, tip: '熟透后压泥' },
  { name: '火龙果', min: 8, group: 'fruit', allergen: false, tip: '红心火龙果可能让大便、尿液变红，不必惊慌' },
  { name: '猕猴桃', min: 8, group: 'fruit', allergen: false, tip: '偏酸，少数宝宝会口周发红，初次少量尝试' },
  { name: '蓝莓', min: 8, group: 'fruit', allergen: false, tip: '压扁或切成小块，整颗易呛噎' },
  { name: '橙子', min: 8, group: 'fruit', allergen: false, tip: '去膜去籽取果肉，偏酸先少量' },
  { name: '草莓', min: 8, group: 'fruit', allergen: false, tip: '洗净切碎，接触后口周发红需观察' },
  { name: '桃子', min: 8, group: 'fruit', allergen: false, tip: '去皮去核，熟软后压泥或切小块' },
  { name: '葡萄', min: 10, group: 'fruit', allergen: false, tip: '必须去皮去籽并切成四瓣，整颗极易呛噎' },
  { name: '蜂蜜', min: 12, group: 'fruit', allergen: false, tip: '1岁以内禁止食用，有引起婴儿肉毒杆菌中毒的风险' },

  // 畜禽肉类
  { name: '猪肉', min: 6, group: 'meat', allergen: false, tip: '瘦肉煮熟打成细腻肉泥，是补铁好选择' },
  { name: '牛肉', min: 6, group: 'meat', allergen: false, tip: '血红素铁含量高、吸收好，打成肉泥' },
  { name: '鸡肉', min: 6, group: 'meat', allergen: false, tip: '鸡胸或鸡腿肉打泥，口感细嫩' },
  { name: '猪肝', min: 7, group: 'meat', allergen: false, tip: '补铁补维生素A，每周1-2次、每次少量' },
  { name: '鸡肝', min: 7, group: 'meat', allergen: false, tip: '质地细腻，蒸熟压泥，每周1-2次' },
  { name: '羊肉', min: 8, group: 'meat', allergen: false, tip: '去筋膜煮烂，冬季可适量添加' },
  { name: '猪血', min: 8, group: 'meat', allergen: false, tip: '补铁佳品，选正规来源，煮熟切碎' },

  // 蛋类
  { name: '鸡蛋', min: 6, group: 'egg', allergen: true, tip: '常见过敏原，从少量蛋黄开始，无异常再逐步到全蛋' },
  { name: '鹌鹑蛋', min: 8, group: 'egg', allergen: true, tip: '整颗易呛噎，需压碎或切小块' },

  // 鱼虾类
  { name: '鳕鱼', min: 7, group: 'fish', allergen: true, tip: '选真鳕鱼，蒸熟后仔细挑刺压碎' },
  { name: '三文鱼', min: 7, group: 'fish', allergen: true, tip: '富含DHA，彻底蒸熟后压泥' },
  { name: '鲈鱼', min: 7, group: 'fish', allergen: true, tip: '刺少肉嫩，蒸熟后仔细挑刺' },
  { name: '龙利鱼', min: 7, group: 'fish', allergen: true, tip: '肉质细腻，确认无刺后蒸熟压碎' },
  { name: '虾', min: 8, group: 'fish', allergen: true, tip: '常见过敏原，去壳去虾线剁成虾泥，首次少量' },

  // 大豆及坚果类
  { name: '豆腐', min: 7, group: 'bean', allergen: true, tip: '大豆制品，嫩豆腐蒸熟压碎，优质植物蛋白' },
  { name: '毛豆', min: 10, group: 'bean', allergen: true, tip: '即新鲜大豆，煮熟去皮压泥，整粒易呛噎' },
  { name: '红豆', min: 10, group: 'bean', allergen: false, tip: '提前浸泡，煮至软烂后压泥' },
  { name: '花生酱', min: 8, group: 'bean', allergen: true, tip: '只用无添加纯花生酱，温水稀释后少量尝试；整粒花生3岁前禁止' },
  { name: '核桃粉', min: 10, group: 'bean', allergen: true, tip: '磨成细粉拌入粥中；整粒、碎粒坚果3岁前易呛噎' },
  { name: '芝麻酱', min: 10, group: 'bean', allergen: true, tip: '少量拌入面条或粥中，留意芝麻过敏' },

  // 奶类
  { name: '酸奶', min: 8, group: 'dairy', allergen: true, tip: '选无添加原味酸奶，作为辅食的一部分，不替代母乳或配方奶' },
  { name: '奶酪', min: 8, group: 'dairy', allergen: true, tip: '选低钠婴幼儿奶酪，切小块或刨丝' },
  { name: '鲜牛奶', min: 12, group: 'dairy', allergen: true, tip: '1岁后才可作为日常饮品，1岁前不宜替代母乳或配方奶' },
]

/* ── 食谱 ───────────────────────────────────────────────────────────────── */

export const RECIPES: Recipe[] = [
  /* 6-7 月龄 · 泥糊 */
  {
    id: 'r01', name: '高铁米粉糊', min: 6, texture: '泥糊', meal: 'main',
    ingredients: ['高铁米粉 1-2勺', '温开水或母乳/配方奶 适量'],
    steps: ['按包装说明取米粉放入碗中', '缓缓加入约50℃的温水，边加边搅拌至无颗粒', '第一次调稀一些，之后逐渐加稠到能挂在勺子上'],
    tip: '作为第一口辅食，从1-2勺开始；之后每次只添加一种新食物，观察3-5天', allergens: [],
  },
  {
    id: 'r02', name: '南瓜泥', min: 6, texture: '泥糊', meal: 'main',
    ingredients: ['南瓜 50g'],
    steps: ['南瓜去皮去籽，切成小块', '上锅蒸15分钟至软烂', '用勺压成泥或打细，加少量温水调稀'],
    tip: '新食材单独尝试，观察3-5天无过敏再与米粉混合', allergens: [],
  },
  {
    id: 'r03', name: '胡萝卜泥', min: 6, texture: '泥糊', meal: 'main',
    ingredients: ['胡萝卜 半根'],
    steps: ['胡萝卜洗净去皮切片', '蒸20分钟至筷子能轻松戳透', '加少量蒸胡萝卜的水打成细腻的泥'],
    tip: '新食材观察3-5天；一次吃太多皮肤可能暂时发黄，减量即可恢复', allergens: [],
  },
  {
    id: 'r04', name: '猪肉泥', min: 6, texture: '泥糊', meal: 'main',
    ingredients: ['猪里脊 30g', '姜片 1片'],
    steps: ['里脊切小块，冷水下锅加姜片焯水去血沫', '换清水煮30分钟至软烂', '加少量肉汤，用料理机打成细腻的肉泥'],
    tip: '肉泥是6月龄后补铁的重要来源；可冻成小块分次加热，加热后一次吃完', allergens: [],
  },
  {
    id: 'r05', name: '蒸苹果泥', min: 6, texture: '泥糊', meal: 'snack',
    ingredients: ['苹果 半个'],
    steps: ['苹果洗净去皮去核，切成小块', '蒸10分钟至软', '用勺压成泥'],
    tip: '蒸熟的苹果泥更易消化；新食材观察3-5天', allergens: [],
  },
  {
    id: 'r06', name: '西兰花土豆泥', min: 6, texture: '泥糊', meal: 'main',
    ingredients: ['西兰花 3朵', '土豆 半个'],
    steps: ['土豆去皮切块，西兰花取花冠洗净', '一起蒸15分钟至软烂', '加少量温水打成细泥'],
    tip: '两种食材都单独尝试过、确认不过敏后再混合', allergens: [],
  },
  {
    id: 'r07', name: '香蕉牛油果泥', min: 6, texture: '泥糊', meal: 'snack',
    ingredients: ['熟透的香蕉 1/3根', '牛油果 1/4个'],
    steps: ['香蕉和牛油果去皮取果肉', '用勺子压成细腻的泥，混合均匀', '现做现吃，避免氧化变色'],
    tip: '富含优质脂肪和能量，适合体重增长偏慢的宝宝', allergens: [],
  },
  {
    id: 'r08', name: '牛肉米粉糊', min: 6, texture: '泥糊', meal: 'main',
    ingredients: ['牛里脊 20g', '高铁米粉 2勺'],
    steps: ['牛肉焯水后煮至软烂，打成细泥', '按说明冲调好米粉', '把牛肉泥拌入米粉糊中'],
    tip: '牛肉富含血红素铁；牛肉和米粉都单独尝试过再混合', allergens: [],
  },
  {
    id: 'r09', name: '蛋黄米糊', min: 6, texture: '泥糊', meal: 'main',
    ingredients: ['鸡蛋 1个', '高铁米粉 2勺'],
    steps: ['鸡蛋冷水下锅，煮10分钟至全熟', '取1/4个蛋黄，用温水压成泥', '拌入调好的米粉糊中'],
    tip: '鸡蛋是常见过敏原，从少量蛋黄开始，观察3-5天无异常再逐步加量', allergens: ['鸡蛋'],
  },

  /* 7-9 月龄 · 碎末 */
  {
    id: 'r10', name: '鸡肝泥', min: 7, texture: '泥糊', meal: 'main',
    ingredients: ['鸡肝 1个', '姜片 1片'],
    steps: ['鸡肝剔除筋膜，清水浸泡30分钟', '加姜片冷水下锅煮熟', '压成细泥，拌入粥或米粉中'],
    tip: '每周1-2次、每次10-15g即可；选择来源可靠的食材', allergens: [],
  },
  {
    id: 'r11', name: '鳕鱼菠菜粥', min: 7, texture: '碎末', meal: 'main',
    ingredients: ['真鳕鱼 30g', '菠菜叶 3片', '大米 20g'],
    steps: ['大米加水煮成烂粥', '菠菜焯水后切碎，鳕鱼蒸熟、仔细挑刺后压碎', '把鱼肉和菠菜碎加入粥中再煮2分钟'],
    tip: '鱼类是常见过敏原，首次单独少量尝试并观察3-5天；喂前再确认无刺', allergens: ['鱼'],
  },
  {
    id: 'r12', name: '番茄牛肉粥', min: 8, texture: '碎末', meal: 'main',
    ingredients: ['牛肉末 20g', '番茄 半个', '大米 20g'],
    steps: ['番茄烫一下去皮去籽，切成碎末', '大米煮成稠粥', '加入牛肉末和番茄碎，小火煮至肉熟'],
    tip: '番茄中的维生素C能促进铁的吸收', allergens: [],
  },
  {
    id: 'r13', name: '山药小米粥', min: 7, texture: '碎末', meal: 'main',
    ingredients: ['铁棍山药 30g', '小米 20g'],
    steps: ['小米洗净，加水煮20分钟', '山药去皮切小丁，加入粥中', '煮至山药软烂后压碎'],
    tip: '处理山药时大人戴手套，防止手部发痒；新食材观察3-5天', allergens: [],
  },
  {
    id: 'r14', name: '豆腐蔬菜羹', min: 7, texture: '碎末', meal: 'main',
    ingredients: ['嫩豆腐 30g', '胡萝卜 10g', '青菜叶 2片'],
    steps: ['胡萝卜蒸软切碎，青菜焯水切碎', '豆腐压碎', '所有食材加少量水煮3分钟成羹'],
    tip: '豆腐属大豆制品，是常见过敏原，首次少量并观察3-5天', allergens: ['大豆'],
  },
  {
    id: 'r15', name: '鸡肉南瓜烂面', min: 7, texture: '碎末', meal: 'main',
    ingredients: ['婴儿面条 一小把', '鸡胸肉 20g', '南瓜 20g'],
    steps: ['鸡肉煮熟剁成碎末，南瓜蒸熟压泥', '面条掰成小段，煮至软烂', '加入鸡肉末和南瓜泥拌匀'],
    tip: '面条含小麦，首次添加注意观察3-5天', allergens: ['小麦'],
  },
  {
    id: 'r16', name: '三文鱼土豆泥', min: 7, texture: '碎末', meal: 'main',
    ingredients: ['三文鱼 20g', '土豆 半个'],
    steps: ['土豆蒸熟压泥', '三文鱼彻底蒸熟，去皮去刺后压碎', '与土豆泥混合均匀'],
    tip: '三文鱼富含DHA；鱼类首次添加观察3-5天', allergens: ['鱼'],
  },
  {
    id: 'r17', name: '嫩蒸蛋羹', min: 7, texture: '泥糊', meal: 'main',
    ingredients: ['鸡蛋 1个', '温开水 约为蛋液的1.5倍'],
    steps: ['鸡蛋打散，加入温开水搅匀', '过筛去掉浮沫，盖上盘子', '水开后中小火蒸8-10分钟'],
    tip: '确认宝宝对蛋黄不过敏后再尝试全蛋，观察3-5天', allergens: ['鸡蛋'],
  },
  {
    id: 'r18', name: '猪肝菠菜粥', min: 8, texture: '碎末', meal: 'main',
    ingredients: ['猪肝 15g', '菠菜 2片', '大米 20g'],
    steps: ['猪肝浸泡去血水，煮熟后切成碎末', '菠菜焯水切碎', '和大米粥一起再煮3分钟'],
    tip: '补铁又补维生素A，每周1-2次即可', allergens: [],
  },
  {
    id: 'r19', name: '虾仁西兰花粥', min: 8, texture: '碎末', meal: 'main',
    ingredients: ['鲜虾 2只', '西兰花 2朵', '大米 20g'],
    steps: ['虾去壳去虾线，剁成虾泥', '西兰花焯水切碎', '大米煮成粥后加入虾泥和西兰花碎，煮至虾肉变色'],
    tip: '虾是常见过敏原，首次少量并观察3-5天', allergens: ['虾'],
  },
  {
    id: 'r20', name: '红薯燕麦糊', min: 7, texture: '碎末', meal: 'snack',
    ingredients: ['红薯 30g', '纯燕麦片 10g'],
    steps: ['红薯蒸熟压泥', '燕麦片加水煮软', '与红薯泥混合，加温开水调成糊'],
    tip: '富含膳食纤维，有助于预防便秘', allergens: [],
  },

  /* 9-12 月龄 · 颗粒 / 小块 */
  {
    id: 'r21', name: '胡萝卜鸡肉软饭', min: 9, texture: '颗粒', meal: 'main',
    ingredients: ['软米饭 半碗', '鸡腿肉 30g', '胡萝卜 15g'],
    steps: ['鸡腿肉去皮切小丁，胡萝卜切小丁', '与软米饭一起加少量水焖煮至软烂', '拌匀后稍微压一压'],
    tip: '逐步增加颗粒感，锻炼咀嚼；12月龄内不加任何调味品', allergens: [],
  },
  {
    id: 'r22', name: '鳕鱼豆腐羹', min: 9, texture: '颗粒', meal: 'main',
    ingredients: ['鳕鱼 30g', '嫩豆腐 30g', '青菜 1片'],
    steps: ['鳕鱼去刺切小丁，豆腐切小丁，青菜切碎', '锅中加水煮开，放入豆腐和鳕鱼煮3分钟', '加入青菜碎再煮1分钟'],
    tip: '鱼和豆腐都单独尝试过再搭配；喂前再确认无刺', allergens: ['鱼', '大豆'],
  },
  {
    id: 'r23', name: '蔬菜鸡蛋饼', min: 10, texture: '小块', meal: 'snack',
    ingredients: ['鸡蛋 1个', '面粉 15g', '胡萝卜 10g', '西葫芦 10g'],
    steps: ['胡萝卜、西葫芦擦成细丝', '与鸡蛋、面粉加少量水调成糊', '平底锅刷薄油，小火煎至两面熟透，切成手指条'],
    tip: '适合做手指食物，锻炼自主进食', allergens: ['鸡蛋', '小麦'],
  },
  {
    id: 'r24', name: '番茄鸡蛋烂面', min: 9, texture: '颗粒', meal: 'main',
    ingredients: ['婴儿面条 一小把', '番茄 半个', '鸡蛋 1个'],
    steps: ['番茄去皮切小丁，加少量水煮软出汁', '水开后下面条，煮至软烂', '淋入打散的蛋液，煮熟后剪成小段'],
    tip: '颗粒感适中，酸酸的很开胃', allergens: ['鸡蛋', '小麦'],
  },
  {
    id: 'r25', name: '手指蔬菜条', min: 9, texture: '小块', meal: 'snack',
    ingredients: ['胡萝卜 1段', '西兰花 2朵', '南瓜 1块'],
    steps: ['蔬菜切成宝宝手指粗细的长条', '蒸到大人用手指能轻松压扁的软度', '放凉后让宝宝自己抓着吃'],
    tip: '软度以大人手指能压碎为准；全程坐着吃并有人看护', allergens: [],
  },
  {
    id: 'r26', name: '牛肉蔬菜小丸子', min: 10, texture: '小块', meal: 'main',
    ingredients: ['牛肉末 40g', '胡萝卜 10g', '洋葱 5g', '淀粉 少许'],
    steps: ['胡萝卜和洋葱切成极细的末', '与牛肉末、少许淀粉拌匀，搓成小丸子', '水开后放入煮熟，或上锅蒸15分钟'],
    tip: '丸子不宜过大过硬，吃时掰成小块', allergens: [],
  },
  {
    id: 'r27', name: '南瓜软饼', min: 10, texture: '小块', meal: 'snack',
    ingredients: ['南瓜泥 30g', '面粉 20g'],
    steps: ['南瓜泥和面粉拌成较稠的面糊', '平底锅刷薄油，舀一勺面糊摊成小饼', '小火煎至两面熟透'],
    tip: '南瓜自带天然的甜味，不需要额外调味', allergens: ['小麦'],
  },
  {
    id: 'r28', name: '虾仁豆腐蒸蛋', min: 10, texture: '颗粒', meal: 'main',
    ingredients: ['鸡蛋 1个', '虾仁 2只', '嫩豆腐 20g'],
    steps: ['虾仁切小丁，豆腐压碎', '鸡蛋打散加温水搅匀，放入虾丁和豆腐', '中小火蒸10分钟'],
    tip: '三种食材都单独尝试过再组合', allergens: ['鸡蛋', '虾', '大豆'],
  },

  /* 12 月龄以上 · 软烂家常 */
  {
    id: 'r29', name: '鲜肉小馄饨', min: 12, texture: '软烂家常', meal: 'main',
    ingredients: ['馄饨皮 8张', '猪肉末 40g', '青菜 1棵'],
    steps: ['青菜焯水切碎，与肉末拌匀做馅', '包成小馄饨', '煮熟后用剪刀剪成小块'],
    tip: '1-2岁仍尽量少盐，汤里放青菜、香菇提鲜即可', allergens: ['小麦'],
  },
  {
    id: 'r30', name: '什锦软米饭', min: 12, texture: '软烂家常', meal: 'main',
    ingredients: ['大米 30g', '鸡肉丁 20g', '香菇 1朵', '胡萝卜 10g', '豌豆 10g'],
    steps: ['所有配菜切成小丁', '与大米一起加稍多的水煮成软饭', '出锅前拌匀，豌豆压破皮'],
    tip: '一碗饭搭配谷物、肉和蔬菜，营养均衡', allergens: [],
  },
  {
    id: 'r31', name: '番茄土豆炖牛肉', min: 12, texture: '软烂家常', meal: 'main',
    ingredients: ['牛肉 50g', '番茄 1个', '土豆 半个'],
    steps: ['牛肉切小块焯水，加水炖40分钟至软烂', '加入番茄块和土豆块再炖20分钟', '把牛肉和土豆压成适合入口的小块，拌饭吃'],
    tip: '一定要炖得软烂，宝宝才嚼得动', allergens: [],
  },
  {
    id: 'r32', name: '清蒸鲈鱼', min: 12, texture: '软烂家常', meal: 'main',
    ingredients: ['鲈鱼 1段', '姜丝 少许', '葱丝 少许'],
    steps: ['鲈鱼洗净，鱼身铺上姜丝', '水开后蒸8-10分钟', '取鱼腹部位的肉，仔细挑刺后喂食'],
    tip: '鱼腹部位刺少，但仍要逐块检查鱼刺', allergens: ['鱼'],
  },
  {
    id: 'r33', name: '西葫芦虾仁饺子', min: 12, texture: '软烂家常', meal: 'main',
    ingredients: ['饺子皮 10张', '虾仁 50g', '西葫芦 半根', '鸡蛋 1个'],
    steps: ['西葫芦擦丝，挤掉部分水分；虾仁剁碎', '与打散的鸡蛋拌匀成馅', '包成小饺子，煮熟后切小块'],
    tip: '可以一次多包一些冷冻，随吃随煮', allergens: ['小麦', '虾', '鸡蛋'],
  },
  {
    id: 'r34', name: '香菇鸡肉粥', min: 12, texture: '软烂家常', meal: 'main',
    ingredients: ['大米 30g', '鸡胸肉 30g', '香菇 1朵', '青菜 1棵'],
    steps: ['大米煮成稠粥', '鸡肉、香菇切小丁，青菜切碎', '加入粥中煮熟'],
    tip: '粥比米饭更好消化，适合生病恢复期', allergens: [],
  },
  {
    id: 'r35', name: '牛奶香蕉燕麦粥', min: 12, texture: '软烂家常', meal: 'snack',
    ingredients: ['纯燕麦片 20g', '全脂鲜牛奶 100ml', '香蕉 半根'],
    steps: ['燕麦片加少量水煮软', '倒入牛奶，小火煮开', '加入香蕉片压碎拌匀'],
    tip: '1岁后才可用鲜牛奶；香蕉的天然甜味就足够了', allergens: ['牛奶'],
  },
  {
    id: 'r36', name: '奶酪菠菜蛋卷', min: 18, texture: '软烂家常', meal: 'snack',
    ingredients: ['鸡蛋 1个', '儿童奶酪片 半片', '菠菜 2片'],
    steps: ['菠菜焯水切碎，与蛋液混合', '平底锅刷薄油，倒入蛋液摊成薄饼', '放上奶酪片卷起，切成小段'],
    tip: '奶酪选低钠儿童奶酪；切段后方便宝宝自己拿着吃', allergens: ['鸡蛋', '牛奶'],
  },
  {
    id: 'r37', name: '南瓜杂粮小馒头', min: 18, texture: '软烂家常', meal: 'snack',
    ingredients: ['面粉 100g', '玉米面 20g', '南瓜泥 50g', '酵母 1g'],
    steps: ['所有材料混合，加适量温水揉成光滑面团', '发酵至两倍大，揉匀后搓成小剂子', '二次醒发15分钟，上锅蒸15分钟'],
    tip: '做成宝宝一口大小，方便自己拿着吃', allergens: ['小麦'],
  },
  {
    id: 'r38', name: '冬瓜肉丸汤', min: 18, texture: '软烂家常', meal: 'main',
    ingredients: ['冬瓜 50g', '猪肉末 40g', '淀粉 少许'],
    steps: ['冬瓜去皮切薄片', '肉末加少许淀粉拌匀，挤成小丸子', '水开后下丸子和冬瓜，煮至冬瓜透明'],
    tip: '清淡解腻，适合夏季', allergens: [],
  },
  {
    id: 'r39', name: '三色蛋炒饭', min: 24, texture: '软烂家常', meal: 'main',
    ingredients: ['米饭 半碗', '鸡蛋 1个', '胡萝卜 10g', '青豆 10g', '玉米粒 10g', '盐 少许'],
    steps: ['胡萝卜切丁，青豆、玉米粒焯水煮软', '鸡蛋炒散盛出', '少油翻炒蔬菜和米饭，加入鸡蛋，少许盐调味'],
    tip: '2岁后可少量加盐，口味仍以清淡为主；玉米粒要煮软防呛', allergens: ['鸡蛋'],
  },
  {
    id: 'r40', name: '鸡丝蔬菜卷饼', min: 24, texture: '软烂家常', meal: 'snack',
    ingredients: ['全麦饼皮 1张', '鸡胸肉 30g', '黄瓜 10g', '胡萝卜 10g'],
    steps: ['鸡肉煮熟撕成细丝，黄瓜、胡萝卜切细丝', '把食材铺在饼皮上卷起', '切成宝宝一口大小的小段'],
    tip: '可以让宝宝参与卷饼，锻炼动手能力和进食兴趣', allergens: ['小麦'],
  },
]

/* ── 喂养原则 ───────────────────────────────────────────────────────────── */

export const FEEDING_PRINCIPLES: string[] = [
  '满6月龄开始添加辅食，同时继续母乳喂养，可至2岁或以上',
  '首选富含铁的泥糊状食物，如高铁米粉、肉泥、肝泥',
  '每次只添加一种新食物，由少到多，观察3-5天无过敏再添加下一种',
  '质地由稀到稠、由细到粗：泥糊 → 碎末 → 颗粒 → 小块 → 软烂家常饭',
  '12月龄内辅食不加盐、糖和调味品，2岁内尽量保持清淡原味',
  '1岁以内不吃蜂蜜，不用鲜牛奶替代母乳或配方奶，不喝果汁',
  '回应式喂养：读懂饥饿与吃饱的信号，不强迫、不追喂',
  '鼓励自主进食，允许用手抓、弄脏，每餐控制在20-30分钟',
  '进餐时坐在餐椅上专心吃饭，不看电视手机，不边玩边吃',
  '整粒坚果、果冻、整颗葡萄、小圆硬糖等易呛噎食物3岁前不给',
  '食物现做现吃，餐具清洁消毒，剩余食物不反复加热喂食',
  '定期测量身长体重，对照生长曲线评估喂养是否合适',
]
