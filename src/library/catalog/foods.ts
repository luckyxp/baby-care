/* ============================================================================
 *  食材扩充 · 品种、处理方式和常见过敏原
 * ----------------------------------------------------------------------------
 *  起始月龄是制作质地的参考，不代表此前必须回避该食物；以准备度、耐受情况和
 *  儿保建议为准。allergen=false 只表示未列为常见过敏原，不代表绝不会过敏。
 * ========================================================================== */

import type { Food } from '../types'

export const CATALOG_FOODS: Food[] = [
  /* ---- 谷物与面食 · 14 种 ---- */
  { name: '藜麦', min: 8, group: 'grain', allergen: false, tip: '按包装要求充分淘洗、煮透，打碎拌入粥中；不整粒干吃' },
  { name: '荞麦', min: 8, group: 'grain', allergen: true, tip: '煮软打细，初次少量观察；荞麦本身也可能引起过敏' },
  { name: '大麦', min: 10, group: 'grain', allergen: true, tip: '含麸质，浸泡后煮至软烂打碎，不给干硬整粒' },
  { name: '糙米', min: 10, group: 'grain', allergen: false, tip: '与精米搭配，浸泡后多加水煮软，避免仅靠粗粮作为主食' },
  { name: '黑米', min: 10, group: 'grain', allergen: false, tip: '少量与大米同煮至开花，按能力打碎；不做黏硬饭团' },
  { name: '红米', min: 10, group: 'grain', allergen: false, tip: '充分浸泡煮软后与精米混合，不追求粗粮比例' },
  { name: '高粱米', min: 12, group: 'grain', allergen: false, tip: '浸泡后少量混煮，确认软烂无硬芯，必要时打碎' },
  { name: '玉米面', min: 8, group: 'grain', allergen: false, tip: '用细玉米面加足水煮透，不能用开水简单冲烫代替煮熟' },
  { name: '小麦面粉', min: 7, group: 'grain', allergen: true, tip: '含小麦，制作面糊、面片须彻底熟透，不尝生面糊' },
  { name: '全麦面粉', min: 12, group: 'grain', allergen: true, tip: '含小麦，少量与精面粉搭配，做成湿润软食，不做干硬饼干' },
  { name: '意大利面', min: 10, group: 'grain', allergen: true, tip: '通常含小麦，查看是否另含鸡蛋；煮软剪短，避免长条吸食' },
  { name: '小麦胚芽', min: 10, group: 'grain', allergen: true, tip: '含小麦，选择正规熟制产品，少量加入粥中并按包装加热' },
  { name: '荞麦面', min: 12, group: 'grain', allergen: true, tip: '可能同时含小麦与荞麦，查看配料；充分煮软剪短' },
  { name: '莜麦粉', min: 12, group: 'grain', allergen: false, tip: '按包装要求充分熟制成软糊，留意是否混有小麦配料' },

  /* ---- 蔬菜与菌菇 · 24 种 ---- */
  { name: '上海青', min: 7, group: 'veg', allergen: false, tip: '取嫩叶洗净煮熟打碎，菜梗另煮软后再加' },
  { name: '油麦菜', min: 8, group: 'veg', allergen: false, tip: '充分洗净，去粗梗煮软切细，不生吃长叶' },
  { name: '生菜', min: 8, group: 'veg', allergen: false, tip: '去粗梗洗净煮熟切细，不给整片生叶或带沙叶片' },
  { name: '娃娃菜', min: 7, group: 'veg', allergen: false, tip: '洗净剥开，取嫩叶煮软，粗纤维处切细' },
  { name: '芥菜', min: 10, group: 'veg', allergen: false, tip: '选鲜嫩叶焯熟煮软，味略苦可少量搭配，不用腌制芥菜' },
  { name: '空心菜', min: 10, group: 'veg', allergen: false, tip: '选嫩叶，洗净后彻底煮熟切细，粗硬空心梗不整段给' },
  { name: '苋菜', min: 8, group: 'veg', allergen: false, tip: '焯熟后切细少量搭配，若便色改变同时观察整体状态' },
  { name: '茼蒿', min: 10, group: 'veg', allergen: false, tip: '嫩叶煮软切碎，特殊气味先少量尝试，去除粗梗' },
  { name: '芦笋', min: 8, group: 'veg', allergen: false, tip: '去老皮老根，煮至可轻松压碎，沿纤维切细或打泥' },
  { name: '丝瓜', min: 7, group: 'veg', allergen: false, tip: '去皮去老籽煮软，出现明显苦味就丢弃，不继续食用' },
  { name: '苦瓜', min: 12, group: 'veg', allergen: false, tip: '去籽去瓤焯熟煮软，小量尝味即可，不强迫接受苦味' },
  { name: '佛手瓜', min: 8, group: 'veg', allergen: false, tip: '去皮去核蒸软打碎，成熟果的纤维需处理细腻' },
  { name: '甜菜根', min: 8, group: 'veg', allergen: false, tip: '去皮蒸软打泥，少量搭配；不能把尿便变色一概当成食物所致' },
  { name: '莴笋', min: 10, group: 'veg', allergen: false, tip: '削去粗皮和筋，煮软切细，不能给生硬长条' },
  { name: '豇豆', min: 10, group: 'veg', allergen: false, tip: '去筋煮至全熟软烂再切碎，不给长段或半生豆荚' },
  { name: '四季豆', min: 10, group: 'veg', allergen: false, tip: '去筋切短后充分煮透，避免夹生造成中毒；软烂后切细' },
  { name: '荷兰豆', min: 10, group: 'veg', allergen: false, tip: '去两端和筋，充分煮熟打碎，不整荚或整粒给' },
  { name: '口蘑', min: 10, group: 'veg', allergen: false, tip: '只用正规栽培食用菌，洗净煮熟切细，不食野生菌' },
  { name: '平菇', min: 10, group: 'veg', allergen: false, tip: '正规渠道购买，充分煮熟后横向切断纤维，不给长条' },
  { name: '杏鲍菇', min: 12, group: 'veg', allergen: false, tip: '质地较韧，切极细后炖软，避免整片或厚丁' },
  { name: '白玉菇', min: 12, group: 'veg', allergen: false, tip: '洗净去根，彻底煮熟切碎，不给完整细长菇体' },
  { name: '蟹味菇', min: 12, group: 'veg', allergen: false, tip: '属于栽培菌菇并非蟹肉，煮透切碎，配料另有海鲜时需另判断' },
  { name: '芹菜', min: 12, group: 'veg', allergen: false, tip: '去老筋，选嫩叶和嫩茎煮烂横切细碎，不给生硬纤维' },
  { name: '黄芽白', min: 8, group: 'veg', allergen: false, tip: '选嫩叶洗净煮软切细，较厚菜帮需多煮一会儿' },

  /* ---- 水果 · 19 种 ---- */
  { name: '橘子', min: 8, group: 'fruit', allergen: false, tip: '去籽去膜取果肉压碎，不给整瓣或用果汁替代水果' },
  { name: '柚子', min: 10, group: 'fruit', allergen: false, tip: '去膜去籽把果肉弄碎，服药期间先确认是否需要回避柚类' },
  { name: '哈密瓜', min: 8, group: 'fruit', allergen: false, tip: '外皮洗净再切，去皮去籽，熟软果肉压泥或切适合的小碎块' },
  { name: '西瓜', min: 8, group: 'fruit', allergen: false, tip: '去净籽和硬皮，压碎少量吃，不给带籽大块或果汁奶瓶' },
  { name: '甜瓜', min: 10, group: 'fruit', allergen: false, tip: '充分清洗外皮，熟软果肉去皮去籽处理，硬脆品种蒸软' },
  { name: '李子', min: 10, group: 'fruit', allergen: false, tip: '去净核和硬皮，蒸软压泥，初次少量观察耐受' },
  { name: '杏', min: 10, group: 'fruit', allergen: false, tip: '去皮去核取熟软果肉，绝不给杏核和苦杏仁' },
  { name: '油桃', min: 10, group: 'fruit', allergen: false, tip: '彻底洗净去核去皮，未软熟的先蒸软压泥' },
  { name: '樱桃', min: 10, group: 'fruit', allergen: false, tip: '去梗去核后再次检查，压碎或切细，不能整颗给' },
  { name: '榴莲', min: 12, group: 'fruit', allergen: false, tip: '取少量熟软果肉，去净核与粗纤维后压泥，作为水果搭配而非正餐替代' },
  { name: '覆盆子', min: 10, group: 'fruit', allergen: false, tip: '洗净检查霉变，熟软后压碎，按需要过筛处理籽' },
  { name: '黑莓', min: 10, group: 'fruit', allergen: false, tip: '洗净压碎，必要时过筛去硬籽，不整颗给' },
  { name: '桑葚', min: 10, group: 'fruit', allergen: false, tip: '正规来源充分洗净，去果梗压泥，初次少量尝试' },
  { name: '柿子', min: 12, group: 'fruit', allergen: false, tip: '选完全熟软的不涩果，去皮去籽少量压泥，不给脆硬大块' },
  { name: '荔枝', min: 12, group: 'fruit', allergen: false, tip: '去皮去核切细，少量随正餐或点心吃，不空腹大量食用' },
  { name: '龙眼', min: 12, group: 'fruit', allergen: false, tip: '去净皮核，果肉切细少量吃，不给完整圆滑果肉' },
  { name: '山竹', min: 12, group: 'fruit', allergen: false, tip: '只取洁净软果肉，逐瓣检查硬核并切细，不给整瓣' },
  { name: '菠萝', min: 12, group: 'fruit', allergen: false, tip: '去皮去硬芯煮软切碎，酸度高先少量，不强行继续吃有刺激的果肉' },
  { name: '百香果', min: 12, group: 'fruit', allergen: false, tip: '少量果浆过筛去籽后拌入已耐受食物，不加糖做甜饮料' },

  /* ---- 畜禽与蛋类 · 7 种 ---- */
  { name: '火鸡肉', min: 8, group: 'meat', allergen: false, tip: '去骨去皮去筋，彻底煮熟打碎，不用烟熏或腌制产品' },
  { name: '兔肉', min: 8, group: 'meat', allergen: false, tip: '仔细去细骨和筋膜，炖烂打泥，购买正规检疫产品' },
  { name: '鸽肉', min: 10, group: 'meat', allergen: false, tip: '正规来源彻底熟制，去尽细骨和皮后打碎，不只喝肉汤' },
  { name: '鹅肉', min: 10, group: 'meat', allergen: false, tip: '去皮去筋取瘦肉炖烂，切断纤维后打碎' },
  { name: '鸭血', min: 10, group: 'meat', allergen: false, tip: '选正规包装熟制品，按说明再次充分加热，切细压碎' },
  { name: '鲜鸭蛋', min: 8, group: 'egg', allergen: true, tip: '常见蛋类过敏原，彻底煮熟压碎；不用咸鸭蛋替代' },
  { name: '鲜鹅蛋', min: 10, group: 'egg', allergen: true, tip: '少量彻底熟制后压碎，存在与其他禽蛋交叉过敏的可能' },

  /* ---- 水产 · 6 种 ---- */
  { name: '罗非鱼', min: 8, group: 'fish', allergen: true, tip: '彻底蒸熟，成人逐层检查细刺后压碎，鱼片仍要查刺' },
  { name: '鲳鱼', min: 8, group: 'fish', allergen: true, tip: '选择正规来源，熟制后去皮去骨，仔细检查鱼刺并打碎' },
  { name: '比目鱼', min: 8, group: 'fish', allergen: true, tip: '正规来源充分蒸熟，逐层剔刺后按能力压泥或切碎' },
  { name: '虹鳟鱼', min: 8, group: 'fish', allergen: true, tip: '只能彻底熟吃，不给刺身；检查鱼刺后少量单独尝试' },
  { name: '蛤蜊', min: 12, group: 'fish', allergen: true, tip: '正规来源吐沙后彻底煮熟，只取肉剁细，贝壳碎片完全去除' },
  { name: '青口贝', min: 12, group: 'fish', allergen: true, tip: '彻底煮熟后去壳去足丝，肉剁细；贝类过敏者不尝试' },

  /* ---- 豆类、坚果酱与乳制品 · 10 种 ---- */
  { name: '绿豆', min: 10, group: 'bean', allergen: false, tip: '浸泡煮至开花打细，作为食物少量搭配，不做替奶饮品' },
  { name: '芸豆', min: 12, group: 'bean', allergen: false, tip: '充分浸泡并大火煮透至软烂压泥，不能吃半生豆或整粒豆' },
  { name: '白扁豆', min: 12, group: 'bean', allergen: false, tip: '只用食用级产品，浸泡后充分煮熟打细，不自行作药膳' },
  { name: '小扁豆', min: 10, group: 'bean', allergen: false, tip: '煮至完全软烂压泥，首次少量，按肠胃耐受搭配' },
  { name: '黑豆', min: 10, group: 'bean', allergen: true, tip: '属大豆类，浸泡煮透去皮打细，不能整粒给或代替奶' },
  { name: '杏仁酱', min: 8, group: 'bean', allergen: true, tip: '选无颗粒纯酱，充分稀释拌入已耐受泥糊；不直接喂一勺浓酱' },
  { name: '腰果酱', min: 8, group: 'bean', allergen: true, tip: '树坚果过敏原，细滑纯酱稀释后白天少量尝试，不给整粒或碎粒' },
  { name: '榛子粉', min: 10, group: 'bean', allergen: true, tip: '选无粗颗粒的正规细粉，拌匀湿润食物；不干吃、不用含糖榛子酱' },
  { name: '原味凝乳', min: 10, group: 'dairy', allergen: true, tip: '选择巴氏杀菌乳制作且低钠的无糖产品，压细少量吃，不替代奶' },
  { name: '无糖开菲尔', min: 12, group: 'dairy', allergen: true, tip: '只用正规冷藏、巴氏杀菌乳制作的产品，不自制生乳发酵，不替代正餐' },
]
