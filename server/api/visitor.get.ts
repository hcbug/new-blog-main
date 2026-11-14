import { getRequestIP } from 'h3'
import blogConfig from '~~/blog.config'

/**
 * 访客问候：服务端解析访客 IP 归属地，拼出带地区梗的欢迎语。
 * - 按 IP 缓存 30 分钟，避免访客一多把免费接口打爆
 * - api.ip.sb 失败时回退 ipapi.co，再失败用兜底文案
 * - 响应因人而异，不允许 CDN 缓存（no-store），防止 A 访客的文案被缓存给 B 看
 */

const GEO_TTL = 30 * 60 * 1000
const GEO_MAX = 500

interface Geo {
	nation: string
	province: string
	city: string
	lng?: number
	lat?: number
}

interface CacheEntry {
	text: string
	at: number
}

const cache = new Map<string, CacheEntry>()

function readCache(key: string) {
	const hit = cache.get(key)
	if (!hit)
		return null
	if (Date.now() - hit.at >= GEO_TTL) {
		cache.delete(key)
		return null
	}
	return hit.text
}

function writeCache(key: string, text: string) {
	if (cache.size >= GEO_MAX) {
		const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
		if (oldest)
			cache.delete(oldest[0])
	}
	cache.set(key, { text, at: Date.now() })
}

function distanceKm(aLng: number, aLat: number, bLng: number, bLat: number) {
	const R = 6371
	const toRad = (deg: number) => deg * Math.PI / 180
	const dLat = toRad(bLat - aLat)
	const dLng = toRad(bLng - aLng)
	const sin = Math.sin(dLat / 2) ** 2
		+ Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
	return Math.round(2 * R * Math.asin(Math.sqrt(sin)))
}

async function fetchJson(url: string, timeout = 4000): Promise<any> {
	const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeout) })
	if (!res.ok)
		return null
	return res.json()
}

async function lookupIpSb(ip?: string): Promise<Geo | null> {
	if (!ip)
		return null
	const json = await fetchJson(`https://api.ip.sb/geoip/${ip}`).catch(() => null)
	if (!json?.country)
		return null
	return {
		nation: json.country ?? '',
		province: json.region ?? '',
		city: json.city ?? '',
		lng: json.longitude,
		lat: json.latitude,
	}
}

async function lookupIpApiCo(ip?: string): Promise<Geo | null> {
	if (!ip)
		return null
	const json = await fetchJson(`https://ipapi.co/${ip}/json/`).catch(() => null)
	if (!json?.country_name)
		return null
	return {
		nation: json.country_name ?? '',
		province: json.region ?? '',
		city: json.city ?? '',
		lng: json.latitude,
		lat: json.longitude,
	}
}

// 英文归属地 → 中文
const NATION_CN: Record<string, string> = {
	'China': '中国',
	'Japan': '日本',
	'United States': '美国',
	'United Kingdom': '英国',
	'Russia': '俄罗斯',
	'France': '法国',
	'Germany': '德国',
	'Australia': '澳大利亚',
	'Canada': '加拿大',
	'Singapore': '新加坡',
	'South Korea': '韩国',
	'Taiwan, Province of China': '台湾省',
	'Hong Kong': '香港特别行政区',
	'Macao': '澳门特别行政区',
	'New Zealand': '新西兰',
	'Malaysia': '马来西亚',
	'Thailand': '泰国',
	'India': '印度',
	'Brazil': '巴西',
	'Korea, Republic of': '韩国',
}

const PROVINCE_CN: Record<string, string> = {
	'Beijing': '北京市',
	'Tianjin': '天津市',
	'Chongqing': '重庆市',
	'Hebei': '河北省',
	'Henan': '河南省',
	'Shanxi': '山西省',
	'Inner Mongolia': '内蒙古自治区',
	'Liaoning': '辽宁省',
	'Jilin': '吉林省',
	'Heilongjiang': '黑龙江省',
	'Shanghai': '上海市',
	'Jiangsu': '江苏省',
	'Zhejiang': '浙江省',
	'Anhui': '安徽省',
	'Fujian': '福建省',
	'Jiangxi': '江西省',
	'Shandong': '山东省',
	'Hubei': '湖北省',
	'Hunan': '湖南省',
	'Guangdong': '广东省',
	'Guangxi': '广西壮族自治区',
	'Hainan': '海南省',
	'Sichuan': '四川省',
	'Guizhou': '贵州省',
	'Yunnan': '云南省',
	'Tibet': '西藏自治区',
	'Shaanxi': '陕西省',
	'Gansu': '甘肃省',
	'Qinghai': '青海省',
	'Ningxia': '宁夏回族自治区',
	'Xinjiang': '新疆维吾尔自治区',
}

/** 江苏省主要城市，用于认出老乡 */
const JIANGSU_CITY_CN: Record<string, string> = {
	'Nanjing': '南京市',
	'Suzhou': '苏州市',
	'Wuxi': '无锡市',
	'Changzhou': '常州市',
	'Nantong': '南通市',
	'Suqian': '宿迁市',
	'Xuzhou': '徐州市',
	'Lianyungang': '连云港市',
	'Huai\'an': '淮安市',
	'Yancheng': '盐城市',
	'Yangzhou': '扬州市',
	'Zhenjiang': '镇江市',
	'Taizhou': '泰州市',
}

function cnify(geo: Geo): Geo {
	const nation = NATION_CN[geo.nation] ?? geo.nation
	const province = PROVINCE_CN[geo.province] ?? geo.province
	// 城市名多为英文，识别不了的就不展示，避免“江苏省 Nanjing”这种混搭
	const city = province === '江苏省'
		? JIANGSU_CITY_CN[geo.city] ?? ''
		: /[\u4E00-\u9FA5]/.test(geo.city) ? geo.city : ''
	return { ...geo, nation, province, city }
}

function countryDesc(nation: string): string {
	const table: Record<string, string> = {
		日本: 'こんにちは！樱花季欢迎来江苏看油菜花',
		美国: 'Hello！隔着十二个时区问声好',
		英国: '伦敦的雾和宿迁的雾，哪个更浓呢',
		俄罗斯: 'Привет！战斗民族的朋友你好',
		法国: 'Bonjour！梧桐树这里也有',
		德国: 'Guten Tag！严谨之余也请偶尔摸鱼',
		澳大利亚: 'G\'day！南半球的星空一定很亮吧',
		加拿大: '枫叶红了的时候，寄一片过来吧',
		新加坡: '狮城的朋友，欢迎来逛逛江苏',
		韩国: '안녕하세요！欢迎来玩',
		泰国: 'สวัสดี！冬阴功和十三香，谁更胜一筹',
		印度: 'Namaste！咖喱的香气隔着屏幕都能闻到',
		巴西: 'Olá！桑巴的热情我感受到了',
	}
	return table[nation] ?? '远方的朋友，欢迎来到洪畅的博客'
}

function provinceDesc(province: string, city: string): string {
	if (province === '江苏省' && city === '宿迁市')
		return '原来是宿迁老乡！霸王举鼎、项王故里，还有骆马湖的风，都是老熟人了'
	const table: Record<string, string> = {
		北京市: '北京烤鸭配豆汁儿，今天您喝了吗',
		天津市: '煎饼果子来一套，多放辣子',
		上海市: '外滩的风吹得到你，也吹得到这里',
		重庆市: '山城的火锅很辣，你也很辣',
		河北省: '离京城那么近，有空来江东走走吧',
		河南省: '烩面胡辣汤，中原的味道',
		山西省: '陈醋的酸，煤炭的黑，还有刀削面的香',
		陕西省: '肉夹馍配冰峰，才是完整的西安',
		山东省: '好客山东，煎饼卷大葱管够',
		辽宁省: '东北的冬天，暖气比一切情话都暖',
		吉林省: '长白山落雪的时候，记得添衣',
		黑龙江省: '北国的冰雕很冷，人情很热',
		内蒙古自治区: '天苍苍野茫茫，草原的风替我向你问好',
		新疆维吾尔自治区: '大盘鸡和馕坑肉，西域风情拉满',
		西藏自治区: '雪山与经幡，愿你一路平安',
		宁夏回族自治区: '塞上江南，枸杞红了',
		甘肃省: '一碗牛肉面，一条河西走廊',
		青海省: '青海湖的蓝，装得下所有心事',
		四川省: '成都的茶馆和麻将，安逸得很',
		贵州省: '酸汤鱼上桌，先干一碗',
		云南省: '大理的风、丽江的云，还有版纳的雨',
		广西壮族自治区: '嗦粉吗？螺蛳粉那种',
		广东省: '早茶一盅两件，饮咗茶未',
		海南省: '椰风海韵，替我吹一吹海风',
		福建省: '闽南的茶很香，山与海都很近',
		江西省: '景德镇的瓷，庐山的雾',
		湖南省: '长沙的茶颜悦色，湘江的夜',
		湖北省: '热干面配蛋酒，武汉的早晨',
		安徽省: '黄山归来不看岳，欢迎来坐坐',
		浙江省: '西湖的雨，江南的梦',
		台湾省: '隔着海峡问声好，欢迎来玩',
		香港特别行政区: '维港的夜景，一定很美吧',
		澳门特别行政区: '葡挞和猪扒包，一份都不许少',
	}
	return table[province] ?? ''
}

function timeGreet(hour: number): string {
	if (hour >= 5 && hour < 11)
		return '上午好，愿你今天的计划都能落地'
	if (hour >= 11 && hour < 13)
		return '中午好，再忙也要好好吃饭'
	if (hour >= 13 && hour < 15)
		return '下午好，困的话就眯一会儿'
	if (hour >= 15 && hour < 16)
		return '三点几啦，来点下午茶'
	if (hour >= 16 && hour < 19)
		return '傍晚好，晚霞是今天最好的结尾'
	if (hour >= 19 && hour < 24)
		return '晚上好，欢迎来洪畅的博客逛逛'
	return '夜深了，早点休息，明天再战'
}

function compose(geo: Geo | null): string {
	const { home, fallback } = blogConfig.visitor
	const hour = Number(new Intl.DateTimeFormat('en-GB', {
		hour: '2-digit',
		hour12: false,
		timeZone: blogConfig.timeZone,
	}).format(new Date()))

	const greet = timeGreet(Number.isFinite(hour) ? hour : 12)
	if (!geo)
		return fallback

	const cn = cnify(geo)
	const where = cn.nation === '中国' && cn.province
		? `${cn.province}${cn.city ? ` ${cn.city}` : ''}`.trim()
		: cn.nation || '远方'

	const dist = typeof cn.lng === 'number' && typeof cn.lat === 'number'
		? distanceKm(home.lng, home.lat, cn.lng, cn.lat)
		: null

	const desc = cn.nation === '中国'
		? provinceDesc(cn.province, cn.city)
		: countryDesc(cn.nation)
	const tail = dist !== null ? `你距离洪畅约 ${dist} 公里` : ''
	const extra = [desc, tail].filter(Boolean).join('，')

	return `欢迎来自 ${where} 的访客！\n${greet}\n${extra ? `。${extra}` : ''}`
}

export default defineEventHandler(async (event) => {
	const ip = getRequestIP(event, { xForwardedFor: true }) || ''
	// 私网/环回地址直接兜底，不浪费第三方接口额度
	const isPrivate = !ip || /^(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(ip) || ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd')

	const key = ip || 'anon'
	const hit = readCache(key)
	if (hit)
		return { text: hit }

	const geo = isPrivate
		? null
		: await lookupIpSb(ip) ?? await lookupIpApiCo(ip)
	const text = compose(geo)
	writeCache(key, text)

	setHeader(event, 'Cache-Control', 'no-store')
	return { text }
})
