/* ============================================================================
 *  食材拓展 · 谷物、时蔬、水果与蛋白质来源
 * ----------------------------------------------------------------------------
 *  min 是本库推荐食用形态的起始月龄，不是必须延迟引入过敏原的时间线。
 *  所有食物均可能引起过敏；allergen 标记常见过敏原，不代表其他食材无风险。
 *  整粒、圆形、坚硬、黏稠食物需先改变形态，进餐时坐稳并由成人近距离看护。
 * ========================================================================== */

import type { Food } from './types'

export const EXTRA_FOODS: Food[] = [
  /* -- 谷物与面食 --------------------------------------------------------- */
  { name: '糙米', min: 10, group: 'grain', allergen: false, tip: '少量混入精米，充分浸泡煮烂；不能只吃粗粮，按咀嚼能力打碎' },
  { name: '大麦', min: 10, group: 'grain', allergen: true, tip: '含麸质，充分浸泡煮烂后压碎；初次少量并留意过敏反应' },
  { name: '藜麦', min: 8, group: 'grain', allergen: false, tip: '充分冲洗后与大米同煮至软烂，初次压碎少量添加' },
  { name: '荞麦', min: 8, group: 'grain', allergen: true, tip: '可能致敏，煮烂打细后少量尝试；荞麦面若含小麦也需标记' },
  { name: '小麦胚芽', min: 8, group: 'grain', allergen: true, tip: '含小麦，按产品说明充分熟制后少量拌入粥中，不直接干吞' },
  { name: '玉米面', min: 7, group: 'grain', allergen: false, tip: '选细磨纯玉米面，搅入水中煮熟成细糊，不替代富铁食物' },
  { name: '小麦面粉', min: 7, group: 'grain', allergen: true, tip: '含小麦，制成充分熟透的软面片；不可尝生面糊或食用生面粉' },
  { name: '全麦面粉', min: 12, group: 'grain', allergen: true, tip: '含小麦，少量混入普通面粉做软饼；避免粗硬、过干和黏口' },
  { name: '荞麦面', min: 12, group: 'grain', allergen: true, tip: '查看配料中的小麦及荞麦，选原味低钠产品，煮软剪短后提供' },
  { name: '意大利面条', min: 10, group: 'grain', allergen: true, tip: '通常含小麦，部分含蛋；选无添加款煮软剪短，检查包装过敏原' },

  /* -- 蔬菜与菌菇 --------------------------------------------------------- */
  { name: '油菜', min: 7, group: 'veg', allergen: false, tip: '取嫩叶清洗后焯熟切细，再煮入粥中；粗梗充分煮软' },
  { name: '生菜', min: 8, group: 'veg', allergen: false, tip: '洗净熟制切碎，不给整片生叶，避免叶片贴住口腔' },
  { name: '菜心', min: 8, group: 'veg', allergen: false, tip: '选嫩叶，较粗菜梗去皮煮软后切碎，按咀嚼能力调整' },
  { name: '芦笋', min: 9, group: 'veg', allergen: false, tip: '去老根和硬皮，煮至可轻松压碎后切细，避免长纤维' },
  { name: '口蘑', min: 10, group: 'veg', allergen: false, tip: '选正规种植菌菇，充分煮熟切末；不给整颗或野生蘑菇' },
  { name: '花菜', min: 7, group: 'veg', allergen: false, tip: '取花部洗净蒸至软烂，打泥或压碎；不提供硬梗' },
  { name: '娃娃菜', min: 7, group: 'veg', allergen: false, tip: '取嫩叶煮软后切细，较硬叶梗单独煮透再处理' },
  { name: '丝瓜', min: 8, group: 'veg', allergen: false, tip: '去皮去老籽煮软压碎；若有异常苦味整份弃用，不靠加热去除' },
  { name: '莴笋', min: 10, group: 'veg', allergen: false, tip: '彻底去掉外皮与硬筋，熟制切末，不给生硬条块' },
  { name: '甜椒', min: 10, group: 'veg', allergen: false, tip: '选不辣的甜椒，去籽去皮后蒸软切细，不提供生硬片' },
  { name: '芋头', min: 8, group: 'veg', allergen: false, tip: '成人戴手套去皮，彻底熟透后加水压泥，避免干黏团块' },
  { name: '甜菜根', min: 10, group: 'veg', allergen: false, tip: '去皮煮软打泥，作为蔬菜少量轮换；可能使排泄物暂时染色' },
  { name: '秋葵', min: 10, group: 'veg', allergen: false, tip: '去硬蒂、充分煮熟后切末，老硬外皮弃用，不给整根圆段' },
  { name: '四季豆', min: 10, group: 'veg', allergen: false, tip: '去筋后彻底煮熟煮透再切末；不能仅焯水或吃半生豆角' },
  { name: '荷兰豆', min: 10, group: 'veg', allergen: false, tip: '去筋充分熟制后切得很细；整荚、整粒均需进一步处理' },
  { name: '油麦菜', min: 8, group: 'veg', allergen: false, tip: '取嫩叶洗净煮熟切碎，避免长叶与粗纤维，现做现吃' },

  /* -- 水果 --------------------------------------------------------------- */
  { name: '芒果', min: 8, group: 'fruit', allergen: false, tip: '熟透去皮去核压泥，初次少量；口周发红或瘙痒时停止并观察' },
  { name: '哈密瓜', min: 10, group: 'fruit', allergen: false, tip: '先洗外皮再切开，去籽取熟软果肉压碎，硬脆部分不直接给' },
  { name: '西瓜', min: 8, group: 'fruit', allergen: false, tip: '去净籽并压碎，用勺少量提供，不榨汁代替水果，不给硬瓜皮' },
  { name: '李子', min: 8, group: 'fruit', allergen: false, tip: '去核去皮，选熟软果肉压泥；硬果先蒸软，不整颗提供' },
  { name: '杏', min: 8, group: 'fruit', allergen: false, tip: '去核后取熟软果肉压泥；果核立即收走，不能吃杏核或生苦杏仁' },
  { name: '樱桃', min: 10, group: 'fruit', allergen: false, tip: '彻底去梗去核，纵向切细后压软；不能整颗或只切两半提供' },
  { name: '橘子', min: 8, group: 'fruit', allergen: false, tip: '剥去外皮、瓣膜并去籽，果肉弄碎用勺给，避免整瓣滑入' },
  { name: '柚子', min: 10, group: 'fruit', allergen: false, tip: '去净厚膜与籽，果肉拆碎；服药期间是否可吃需咨询医生或药师' },
  { name: '枇杷', min: 10, group: 'fruit', allergen: false, tip: '去皮去核和内膜，取熟软果肉压碎，果核马上丢入封闭垃圾桶' },
  { name: '百香果', min: 12, group: 'fruit', allergen: false, tip: '滤去籽后少量果肉拌入已耐受食物，偏酸不额外加甜味调料' },
  { name: '无花果', min: 10, group: 'fruit', allergen: false, tip: '选鲜熟软果，洗净去硬蒂、必要时去皮压碎，不用干果块替代' },
  { name: '桑葚', min: 10, group: 'fruit', allergen: false, tip: '洗净去梗后压碎或熟制，不能整串入口，深色果汁易染色' },
  { name: '菠萝', min: 12, group: 'fruit', allergen: false, tip: '去皮去硬芯，选熟软果肉切细或煮软；刺激口腔时停止，不靠泡水消除过敏' },
  { name: '西梅', min: 8, group: 'fruit', allergen: false, tip: '用鲜果去核蒸软压泥；若用干西梅需去核煮软打细，不给黏韧干果' },
  { name: '树莓', min: 8, group: 'fruit', allergen: false, tip: '仔细清洗后压碎，必要时过筛，不能整颗提供或忽略霉变果' },

  /* -- 畜禽肉与蛋 --------------------------------------------------------- */
  { name: '鸭肉', min: 8, group: 'meat', allergen: false, tip: '去皮去骨和筋膜，充分煮熟打泥或切末，避免鸭皮油脂及细骨' },
  { name: '兔肉', min: 8, group: 'meat', allergen: false, tip: '选正规来源，彻底剔骨后煮熟打泥，注意细小碎骨，不提供骨段啃咬' },
  { name: '火鸡肉', min: 8, group: 'meat', allergen: false, tip: '选原切无腌制肉，去皮筋煮熟打碎，不用火鸡肠或烟熏肉替代' },
  { name: '鹅肉', min: 10, group: 'meat', allergen: false, tip: '去皮去骨炖至软烂，顺纹切细再横向剁碎，避免干韧长肉丝' },
  { name: '鸭蛋', min: 8, group: 'egg', allergen: true, tip: '与鸡蛋可能交叉过敏，须彻底熟透压碎；不提供咸鸭蛋或溏心蛋' },

  /* -- 水产 --------------------------------------------------------------- */
  { name: '鲳鱼', min: 8, group: 'fish', allergen: true, tip: '彻底蒸熟，成人拆肉时反复检查细刺，再压碎或切细提供' },
  { name: '黄花鱼', min: 8, group: 'fish', allergen: true, tip: '选新鲜正规来源，熟制后反复去刺；第一次少量尝试并留意反应' },
  { name: '带鱼', min: 10, group: 'fish', allergen: true, tip: '蒸熟后去皮骨与侧边细刺，成人反复检查后只取软鱼肉' },
  { name: '扇贝', min: 12, group: 'fish', allergen: true, tip: '贝类常见过敏原，去内脏后彻底熟制，韧的贝柱剁细，不给整块' },

  /* -- 豆类、坚果制品与奶制品 --------------------------------------------- */
  { name: '鹰嘴豆', min: 8, group: 'bean', allergen: false, tip: '充分浸泡煮到轻压即碎，去皮打泥；不给整粒，不用罐头高钠卤汁' },
  { name: '扁豆', min: 10, group: 'bean', allergen: false, tip: '充分浸泡煮熟煮透后压成细泥，不给半生豆；逐量添加并观察反应' },
  { name: '绿豆', min: 10, group: 'bean', allergen: false, tip: '充分煮烂去皮压泥，少量与主食搭配，不用甜绿豆饮替代奶或正餐' },
  { name: '腰果酱', min: 8, group: 'bean', allergen: true, tip: '选无颗粒纯酱，充分稀释后薄拌入食物；不挖整勺喂，高风险宝宝先咨询医生' },
  { name: '杏仁酱', min: 8, group: 'bean', allergen: true, tip: '只用正规甜杏仁制成的细滑纯酱，稀释后少量混合；不能用苦杏仁或整粒杏仁' },
  { name: '里科塔奶酪', min: 10, group: 'dairy', allergen: true, tip: '选巴氏杀菌乳制成的原味低钠款，少量压碎入菜；确认无牛奶蛋白过敏' },
]
