'use client'

import { useState, useMemo } from 'react'
import { Search, Phone, Mail, MapPin, X, ChevronDown, ChevronUp } from 'lucide-react'

interface Station {
  no: number
  name: string
  phone: string
  email: string
}
interface Region {
  region: string
  color: string
  stations: Station[]
}

const DATA: Region[] = [
  { region: '서울청', color: 'bg-blue-600', stations: [
    { no:1, name:'중부경찰서', phone:'02-3396-9151', email:'su1bbse@police.go.kr' },
    { no:2, name:'종로경찰서', phone:'02-3701-4130', email:'su2bbse@police.go.kr' },
    { no:3, name:'남대문경찰서', phone:'02-2096-8563', email:'su3bbse@police.go.kr' },
    { no:4, name:'서대문경찰서', phone:'02-335-8175', email:'su4bbse@police.go.kr' },
    { no:5, name:'혜화경찰서', phone:'02-3158-7891', email:'su5bbse@police.go.kr' },
    { no:6, name:'용산경찰서', phone:'02-2198-0274', email:'su6bbse@police.go.kr' },
    { no:7, name:'성북경찰서', phone:'02-920-1411', email:'su7bbse@police.go.kr' },
    { no:8, name:'동대문경찰서', phone:'02-961-4137', email:'su8bbse@police.go.kr' },
    { no:9, name:'마포경찰서', phone:'02-3149-6129', email:'su9bbse@police.go.kr' },
    { no:10, name:'영등포경찰서', phone:'02-2118-9438', email:'su10bbse@police.go.kr' },
    { no:11, name:'성동경찰서', phone:'02-2286-0440', email:'su11bbse@police.go.kr' },
    { no:12, name:'동작경찰서', phone:'02-811-9346', email:'su12bbse@police.go.kr' },
    { no:13, name:'광진경찰서', phone:'02-2285-7141', email:'su13bbse@police.go.kr' },
    { no:14, name:'서부경찰서', phone:'02-335-9546', email:'su14bbse@police.go.kr' },
    { no:15, name:'강북경찰서', phone:'02-944-4457', email:'su15bbse@police.go.kr' },
    { no:16, name:'금천경찰서', phone:'02-801-5307', email:'su16bbse@police.go.kr' },
    { no:17, name:'중랑경찰서', phone:'02-2171-0137', email:'su17bbse@police.go.kr' },
    { no:18, name:'강남경찰서', phone:'02-3673-9138', email:'su18bbse@police.go.kr' },
    { no:19, name:'관악경찰서', phone:'02-870-0183', email:'su19bbse@police.go.kr' },
    { no:20, name:'강서경찰서', phone:'02-2620-9143', email:'su20bbse@police.go.kr' },
    { no:21, name:'강동경찰서', phone:'02-3449-7285', email:'su21bbse@police.go.kr' },
    { no:22, name:'종암경찰서', phone:'02-3396-7522', email:'su22bbse@police.go.kr' },
    { no:23, name:'구로경찰서', phone:'02-840-8909', email:'su23bbse@police.go.kr' },
    { no:24, name:'서초경찰서', phone:'02-3483-9492', email:'su24bbse@police.go.kr' },
    { no:25, name:'양천경찰서', phone:'02-2093-8151', email:'su25bbse@police.go.kr' },
    { no:26, name:'송파경찰서', phone:'02-3402-6456', email:'su26bbse@police.go.kr' },
    { no:27, name:'노원경찰서', phone:'02-2092-0284', email:'su27bbse@police.go.kr' },
    { no:28, name:'방배경찰서', phone:'02-3403-8130', email:'su30bbse@police.go.kr' },
    { no:29, name:'은평경찰서', phone:'02-350-1311', email:'su29bbse@police.go.kr' },
    { no:30, name:'도봉경찰서', phone:'02-2289-9344', email:'su28bbse@police.go.kr' },
    { no:31, name:'수서경찰서', phone:'02-2155-9143', email:'su31bbse@police.go.kr' },
    { no:32, name:'김포공항경찰대', phone:'02-3439-5612', email:'airport@police.go.kr' },
  ]},
  { region: '부산청', color: 'bg-sky-600', stations: [
    { no:1, name:'중부경찰서', phone:'051-664-0345', email:'ps1bbse@police.go.kr' },
    { no:2, name:'동래경찰서', phone:'051-559-7346', email:'ps2bbse@police.go.kr' },
    { no:3, name:'영도경찰서', phone:'051-400-9345', email:'ps3bbse@police.go.kr' },
    { no:4, name:'동부경찰서', phone:'051-409-0249', email:'ps4bbse@police.go.kr' },
    { no:5, name:'부산진경찰서', phone:'051-890-9148', email:'ps5bbse@police.go.kr' },
    { no:6, name:'서부경찰서', phone:'051-540-1125', email:'ps6bbse@police.go.kr' },
    { no:7, name:'남부경찰서', phone:'051-610-8786', email:'ps7bbse@police.go.kr' },
    { no:8, name:'해운대경찰서', phone:'051-665-0332', email:'ps8bbse@police.go.kr' },
    { no:9, name:'사상경찰서', phone:'051-329-0345', email:'ps9bbse@police.go.kr' },
    { no:10, name:'금정경찰서', phone:'051-510-0244', email:'ps10bbse@police.go.kr' },
    { no:11, name:'사하경찰서', phone:'051-290-2246', email:'ps11bbse@police.go.kr' },
    { no:12, name:'연제경찰서', phone:'051-750-5865', email:'ps12bbse@police.go.kr' },
    { no:13, name:'강서경찰서', phone:'051-290-0013', email:'ps13bbse@police.go.kr' },
    { no:14, name:'북부경찰서', phone:'051-792-0249', email:'ps14bbse@police.go.kr' },
    { no:15, name:'기장경찰서', phone:'051-793-0346', email:'ps15bbse@police.go.kr' },
    { no:16, name:'수영경찰서', phone:'051-603-6018', email:'ps16bbse@police.go.kr' },
  ]},
  { region: '인천청', color: 'bg-teal-600', stations: [
    { no:1, name:'중부경찰서', phone:'032-760-8131', email:'ic1bbse@police.go.kr' },
    { no:2, name:'미추홀경찰서', phone:'032-717-9346', email:'ic2bbse@police.go.kr' },
    { no:3, name:'남동경찰서', phone:'032-718-9346', email:'ic3bbse@police.go.kr' },
    { no:4, name:'논현경찰서', phone:'032-454-9545', email:'ic0322@police.go.kr' },
    { no:5, name:'부평경찰서', phone:'032-363-1230', email:'ic4bbse@police.go.kr' },
    { no:6, name:'삼산경찰서', phone:'032-509-0346', email:'ic5504@police.go.kr' },
    { no:7, name:'서부경찰서', phone:'032-453-3362', email:'ic5bbse@police.go.kr' },
    { no:8, name:'계양경찰서', phone:'032-363-6239', email:'ic6bbse@police.go.kr' },
    { no:9, name:'연수경찰서', phone:'032-453-0296', email:'ic7bbse@police.go.kr' },
    { no:10, name:'강화경찰서', phone:'032-930-0346', email:'ic8bbse@police.go.kr' },
    { no:11, name:'인천국제공항경찰단', phone:'032-745-5343', email:'kyungbieop@police.go.kr' },
  ]},
  { region: '대구청', color: 'bg-violet-600', stations: [
    { no:1, name:'중부경찰서', phone:'053-420-1096', email:'dg1bbse@police.go.kr' },
    { no:2, name:'동부경찰서', phone:'053-960-3357', email:'dongbus@police.go.kr' },
    { no:3, name:'서부경찰서', phone:'053-608-3815', email:'dg3bbse@police.go.kr' },
    { no:4, name:'남부경찰서', phone:'053-650-2345', email:'dg4bbse@police.go.kr' },
    { no:5, name:'북부경찰서', phone:'053-380-5346', email:'dg5bbse@police.go.kr' },
    { no:6, name:'수성경찰서', phone:'053-600-6346', email:'dg6bbse@police.go.kr' },
    { no:7, name:'달서경찰서', phone:'053-662-6811', email:'dg7bbse@police.go.kr' },
    { no:8, name:'성서경찰서', phone:'053-609-0284', email:'dg8bbse@police.go.kr' },
    { no:9, name:'달성경찰서', phone:'053-660-8346', email:'dg9bbse@police.go.kr' },
    { no:10, name:'강북경찰서', phone:'053-380-3226', email:'dg10bbse@police.go.kr' },
    { no:11, name:'군위경찰서', phone:'054-380-0346', email:'gw0346@police.go.kr' },
  ]},
  { region: '광주청', color: 'bg-emerald-600', stations: [
    { no:1, name:'광산경찰서', phone:'062-602-3346', email:'jn5bbse@police.go.kr' },
    { no:2, name:'동부경찰서', phone:'062-609-4346', email:'jn1bbse@police.go.kr' },
    { no:3, name:'서부경찰서', phone:'062-570-4346', email:'jn2bbse@police.go.kr' },
    { no:4, name:'남부경찰서', phone:'062-612-8346', email:'jn3bbse@police.go.kr' },
    { no:5, name:'북부경찰서', phone:'062-612-4259', email:'jn4bbse@police.go.kr' },
  ]},
  { region: '대전청', color: 'bg-amber-600', stations: [
    { no:1, name:'중부경찰서', phone:'042-220-7546', email:'cn1bbse@police.go.kr' },
    { no:2, name:'동부경찰서', phone:'042-600-2729', email:'cn3bbse@police.go.kr' },
    { no:3, name:'서부경찰서', phone:'042-600-3346', email:'cn2bbse@police.go.kr' },
    { no:4, name:'대덕경찰서', phone:'042-600-4346', email:'cn4bbse@police.go.kr' },
    { no:5, name:'둔산경찰서', phone:'042-600-5846', email:'cn5bbse@police.go.kr' },
    { no:6, name:'유성경찰서', phone:'042-725-6446', email:'cn0bbse@police.go.kr' },
  ]},
  { region: '울산청', color: 'bg-orange-600', stations: [
    { no:1, name:'중부경찰서', phone:'052-241-4346', email:'us1bbse@police.go.kr' },
    { no:2, name:'남부경찰서', phone:'052-208-0346', email:'us2bbse@police.go.kr' },
    { no:3, name:'동부경찰서', phone:'052-210-7344', email:'us3bbse@police.go.kr' },
    { no:4, name:'북부경찰서', phone:'052-240-4338', email:'us5bbse@police.go.kr' },
    { no:5, name:'울주경찰서', phone:'052-283-6346', email:'us4bbse@police.go.kr' },
  ]},
  { region: '세종청', color: 'bg-cyan-600', stations: [
    { no:1, name:'남부경찰서', phone:'044-320-8231', email:'sj1bbse@police.go.kr' },
    { no:2, name:'북부경찰서', phone:'044-330-0708', email:'sj2bbse@police.go.kr' },
  ]},
  { region: '경기남부청', color: 'bg-indigo-600', stations: [
    { no:1, name:'수원장안경찰서', phone:'031-299-5343', email:'kk2bbse@police.go.kr' },
    { no:2, name:'수원영통경찰서', phone:'031-899-0346', email:'kk11bbse@police.go.kr' },
    { no:3, name:'수원권선경찰서', phone:'031-8012-0113', email:'kk34bbse@police.go.kr' },
    { no:4, name:'수원팔달경찰서', phone:'031-369-6288', email:'swpd3@police.go.kr' },
    { no:5, name:'안양동안경찰서', phone:'031-478-7141', email:'kk3bbse@police.go.kr' },
    { no:6, name:'안양만안경찰서', phone:'031-8041-6135', email:'sh490@police.go.kr' },
    { no:7, name:'군포경찰서', phone:'031-390-9343', email:'kk13bbse@police.go.kr' },
    { no:8, name:'성남수정경찰서', phone:'031-750-4143', email:'kk4bbse@police.go.kr' },
    { no:9, name:'성남중원경찰서', phone:'031-8036-5345', email:'kk12bbse@police.go.kr' },
    { no:10, name:'분당경찰서', phone:'031-786-5345', email:'kk14bbse@police.go.kr' },
    { no:11, name:'부천소사경찰서', phone:'032-456-0346', email:'kk1bbse@police.go.kr' },
    { no:12, name:'부천원미경찰서', phone:'032-680-7346', email:'kk5bbse@police.go.kr' },
    { no:13, name:'부천오정경찰서', phone:'032-670-2156', email:'kk50bbse@police.go.kr' },
    { no:14, name:'광명경찰서', phone:'02-2093-0343', email:'kk7bbse@police.go.kr' },
    { no:15, name:'안산단원경찰서', phone:'031-8040-0343', email:'kk10bbse@police.go.kr' },
    { no:16, name:'안산상록경찰서', phone:'031-8040-2319', email:'sangrokpol@police.go.kr' },
    { no:17, name:'시흥경찰서', phone:'031-310-9344', email:'kk18bbse@police.go.kr' },
    { no:18, name:'평택경찰서', phone:'031-8053-0345', email:'kk8bbse@police.go.kr' },
    { no:19, name:'오산경찰서', phone:'031-371-8124', email:'kk19bbse@police.go.kr' },
    { no:20, name:'화성서부경찰서', phone:'031-379-9307', email:'pb52248@police.go.kr' },
    { no:21, name:'화성동탄경찰서', phone:'031-639-1331', email:'kk410bbse@police.go.kr' },
    { no:22, name:'용인동부경찰서', phone:'031-260-0432', email:'kk20bbse@police.go.kr' },
    { no:23, name:'용인서부경찰서', phone:'031-8021-8346', email:'ys5105@police.go.kr' },
    { no:24, name:'광주경찰서', phone:'031-790-7472', email:'kk21bbse@police.go.kr' },
    { no:25, name:'김포경찰서', phone:'031-950-2446', email:'kk25bbse@police.go.kr' },
    { no:26, name:'하남경찰서', phone:'031-790-0345', email:'hn002@police.go.kr' },
    { no:27, name:'과천경찰서', phone:'02-2149-4345', email:'kk16bbse@police.go.kr' },
    { no:28, name:'의왕경찰서', phone:'031-8086-0340', email:'rudql46@police.go.kr' },
    { no:29, name:'이천경찰서', phone:'031-645-0299', email:'kk23bbse@police.go.kr' },
    { no:30, name:'안성경찰서', phone:'031-8046-0417', email:'kk26bbse@police.go.kr' },
    { no:31, name:'여주경찰서', phone:'031-887-0143', email:'kk27bbse@police.go.kr' },
    { no:32, name:'양평경찰서', phone:'031-770-9344', email:'toddks@police.go.kr' },
  ]},
  { region: '경기북부청', color: 'bg-blue-700', stations: [
    { no:1, name:'의정부경찰서', phone:'031-849-3146', email:'kk6bbse@police.go.kr' },
    { no:2, name:'고양경찰서', phone:'031-930-5343', email:'kk15bbse@police.go.kr' },
    { no:3, name:'일산서부경찰서', phone:'031-839-7143', email:'ilsanseobu@police.go.kr' },
    { no:4, name:'일산동부경찰서', phone:'031-929-9330', email:'kk17bbse@police.go.kr' },
    { no:5, name:'남양주남부경찰서', phone:'031-579-8159', email:'kk9bbse@police.go.kr' },
    { no:6, name:'남양주북부경찰서', phone:'031-869-6146', email:'ggp77bbse@police.go.kr' },
    { no:7, name:'파주경찰서', phone:'031-956-5143', email:'kk22bbse@police.go.kr' },
    { no:8, name:'양주경찰서', phone:'031-869-9244', email:'yjpolice@police.go.kr' },
    { no:9, name:'동두천경찰서', phone:'031-869-0142', email:'ggpol791@police.go.kr' },
    { no:10, name:'구리경찰서', phone:'031-560-9142', email:'guricops113@police.go.kr' },
    { no:11, name:'포천경찰서', phone:'031-539-8346', email:'kk24bbse@police.go.kr' },
    { no:12, name:'가평경찰서', phone:'031-580-1347', email:'kk29bbse@police.go.kr' },
    { no:13, name:'연천경찰서', phone:'031-839-5347', email:'kk30bbse@police.go.kr' },
  ]},
  { region: '강원청', color: 'bg-green-700', stations: [
    { no:1, name:'춘천경찰서', phone:'033-245-0607', email:'kw1bbse@police.go.kr' },
    { no:2, name:'강릉경찰서', phone:'033-650-9644', email:'kw2bbse@police.go.kr' },
    { no:3, name:'원주경찰서', phone:'033-738-0346', email:'kw3bbse@police.go.kr' },
    { no:4, name:'동해경찰서', phone:'033-539-3346', email:'kw4bbse@police.go.kr' },
    { no:5, name:'태백경찰서', phone:'033-580-4746', email:'kw5bbse@police.go.kr' },
    { no:6, name:'속초경찰서', phone:'033-634-0347', email:'kw6bbse@police.go.kr' },
    { no:7, name:'삼척경찰서', phone:'033-571-2227', email:'kw7bbse@police.go.kr' },
    { no:8, name:'영월경찰서', phone:'033-370-3347', email:'kw8bbse@police.go.kr' },
    { no:9, name:'정선경찰서', phone:'033-560-5346', email:'knp-5349@police.go.kr' },
    { no:10, name:'홍천경찰서', phone:'033-439-9625', email:'kw10bbse@police.go.kr' },
    { no:11, name:'평창경찰서', phone:'033-339-5247', email:'kw11bbse@police.go.kr' },
    { no:12, name:'횡성경찰서', phone:'033-340-7362', email:'kw12bbse@police.go.kr' },
    { no:13, name:'고성경찰서', phone:'033-680-6346', email:'kw13bbse@police.go.kr' },
    { no:14, name:'인제경찰서', phone:'033-460-9846', email:'kw14bbse@police.go.kr' },
    { no:15, name:'철원경찰서', phone:'033-450-7247', email:'kw15bbse@police.go.kr' },
    { no:16, name:'화천경찰서', phone:'033-440-0357', email:'kw16bbse@police.go.kr' },
    { no:17, name:'양구경찰서', phone:'033-480-9247', email:'kw17bbse@police.go.kr' },
  ]},
  { region: '충북청', color: 'bg-lime-700', stations: [
    { no:1, name:'청주흥덕경찰서', phone:'043-270-3346', email:'cb2bbse@police.go.kr' },
    { no:2, name:'청주상당경찰서', phone:'043-280-1345', email:'cb12bbse@police.go.kr' },
    { no:3, name:'청주청원경찰서', phone:'043-251-1346', email:'cb1bbse@police.go.kr' },
    { no:4, name:'충주경찰서', phone:'043-880-6356', email:'cb3bbse@police.go.kr' },
    { no:5, name:'제천경찰서', phone:'043-641-8226', email:'cb4bbse@police.go.kr' },
    { no:6, name:'음성경찰서', phone:'043-870-7734', email:'cb10bbse@police.go.kr' },
    { no:7, name:'영동경찰서', phone:'043-740-5247', email:'cb5bbse@police.go.kr' },
    { no:8, name:'괴산경찰서', phone:'043-830-1350', email:'cb6bbse@police.go.kr' },
    { no:9, name:'단양경찰서', phone:'043-641-9344', email:'dyp123@police.go.kr' },
    { no:10, name:'보은경찰서', phone:'043-540-1246', email:'cb8bbse@police.go.kr' },
    { no:11, name:'옥천경찰서', phone:'043-730-9761', email:'cb9bbse@police.go.kr' },
    { no:12, name:'진천경찰서', phone:'043-531-5247', email:'cb11bbse@police.go.kr' },
  ]},
  { region: '충남청', color: 'bg-yellow-700', stations: [
    { no:1, name:'천안서북경찰서', phone:'041-536-1277', email:'cn7bbse@police.go.kr' },
    { no:2, name:'천안동남경찰서', phone:'041-590-2312', email:'cadn03@police.go.kr' },
    { no:3, name:'서산경찰서', phone:'041-689-9198', email:'cn6bbse@police.go.kr' },
    { no:4, name:'아산경찰서', phone:'041-538-9346', email:'cn9bbse@police.go.kr' },
    { no:5, name:'논산경찰서', phone:'041-746-3331', email:'cn8bbse@police.go.kr' },
    { no:6, name:'공주경찰서', phone:'041-850-7388', email:'cn10bbse@police.go.kr' },
    { no:7, name:'보령경찰서', phone:'041-939-0295', email:'livelife@police.go.kr' },
    { no:8, name:'당진경찰서', phone:'041-360-4147', email:'cn12bbse@police.go.kr' },
    { no:9, name:'홍성경찰서', phone:'041-630-8346', email:'cn123@police.go.kr' },
    { no:10, name:'예산경찰서', phone:'041-330-9346', email:'cn15bbse@police.go.kr' },
    { no:11, name:'부여경찰서', phone:'041-830-9338', email:'cn16bbse@police.go.kr' },
    { no:12, name:'서천경찰서', phone:'041-955-5345', email:'cn14bbse@police.go.kr' },
    { no:13, name:'금산경찰서', phone:'041-750-0346', email:'cn6404@police.go.kr' },
    { no:14, name:'청양경찰서', phone:'041-940-0331', email:'cypolice@police.go.kr' },
    { no:15, name:'태안경찰서', phone:'041-671-9346', email:'cn26bbse@police.go.kr' },
  ]},
  { region: '전북청', color: 'bg-rose-700', stations: [
    { no:1, name:'완산경찰서', phone:'063-280-0179', email:'jb1bbse@police.go.kr' },
    { no:2, name:'덕진경찰서', phone:'063-713-0356', email:'jb4bbse@police.go.kr' },
    { no:3, name:'군산경찰서', phone:'063-441-0390', email:'jb2bbse@police.go.kr' },
    { no:4, name:'익산경찰서', phone:'063-830-0346', email:'jb3bbse@police.go.kr' },
    { no:5, name:'정읍경찰서', phone:'063-570-0345', email:'jb5bbse@police.go.kr' },
    { no:6, name:'남원경찰서', phone:'063-630-0246', email:'jb6bbse@police.go.kr' },
    { no:7, name:'김제경찰서', phone:'063-540-8743', email:'jb7bbse@police.go.kr' },
    { no:8, name:'완주경찰서', phone:'063-219-1345', email:'jb8bbse@police.go.kr' },
    { no:9, name:'고창경찰서', phone:'063-560-0348', email:'jb9bbse@police.go.kr' },
    { no:10, name:'부안경찰서', phone:'063-580-0247', email:'jb10bbse@police.go.kr' },
    { no:11, name:'임실경찰서', phone:'063-640-0347', email:'jb11bbse@police.go.kr' },
    { no:12, name:'순창경찰서', phone:'063-650-8333', email:'jb12bbse@police.go.kr' },
    { no:13, name:'진안경찰서', phone:'063-430-0346', email:'jb13bbse@police.go.kr' },
    { no:14, name:'장수경찰서', phone:'063-350-4345', email:'jb14bbse@police.go.kr' },
    { no:15, name:'무주경찰서', phone:'063-320-1261', email:'jb15bbse@police.go.kr' },
  ]},
  { region: '전남청', color: 'bg-teal-700', stations: [
    { no:1, name:'목포경찰서', phone:'061-270-0283', email:'jn4606@police.go.kr' },
    { no:2, name:'여수경찰서', phone:'061-660-8346', email:'jn7bbse@police.go.kr' },
    { no:3, name:'순천경찰서', phone:'061-759-0175', email:'jn8bbse@police.go.kr' },
    { no:4, name:'나주경찰서', phone:'061-339-0346', email:'jn4906@police.go.kr' },
    { no:5, name:'광양경찰서', phone:'061-760-0346', email:'jn5006@police.go.kr' },
    { no:6, name:'고흥경찰서', phone:'061-830-0329', email:'ghscl@police.go.kr' },
    { no:7, name:'해남경찰서', phone:'061-530-1344', email:'jn1344@police.go.kr' },
    { no:8, name:'무안경찰서', phone:'061-455-0346', email:'jn24bbse@police.go.kr' },
    { no:9, name:'장흥경찰서', phone:'061-860-7346', email:'jn5306@police.go.kr' },
    { no:10, name:'보성경찰서', phone:'061-850-0346', email:'jn5904@police.go.kr' },
    { no:11, name:'영광경찰서', phone:'061-350-0346', email:'jn15bbse@police.go.kr' },
    { no:12, name:'화순경찰서', phone:'061-379-4346', email:'jn16bbse@police.go.kr' },
    { no:13, name:'함평경찰서', phone:'061-320-1346', email:'jn17bbse@police.go.kr' },
    { no:14, name:'영암경찰서', phone:'061-470-0346', email:'jn5906@police.go.kr' },
    { no:15, name:'장성경찰서', phone:'061-399-4246', email:'jn6006@police.go.kr' },
    { no:16, name:'강진경찰서', phone:'061-430-7334', email:'jn20bbse@police.go.kr' },
    { no:17, name:'담양경찰서', phone:'061-380-4354', email:'jn56346@police.go.kr' },
    { no:18, name:'곡성경찰서', phone:'061-360-6233', email:'jngs0112@police.go.kr' },
    { no:19, name:'완도경찰서', phone:'061-550-7246', email:'jnwdsa@police.go.kr' },
    { no:20, name:'진도경찰서', phone:'061-540-0345', email:'jindo1115@police.go.kr' },
    { no:21, name:'구례경찰서', phone:'061-780-9330', email:'jnp346@police.go.kr' },
    { no:22, name:'신안경찰서', phone:'061-469-0346', email:'jnsa0112@police.go.kr' },
  ]},
  { region: '경북청', color: 'bg-purple-700', stations: [
    { no:1, name:'경주경찰서', phone:'054-760-0231', email:'kb4106@police.go.kr' },
    { no:2, name:'포항북부경찰서', phone:'054-250-0339', email:'kb2bbse@police.go.kr' },
    { no:3, name:'포항남부경찰서', phone:'054-240-8346', email:'kb4bbse@police.go.kr' },
    { no:4, name:'구미경찰서', phone:'054-450-3147', email:'kb3bbse@police.go.kr' },
    { no:5, name:'경산경찰서', phone:'053-770-0759', email:'kb5bbse@police.go.kr' },
    { no:6, name:'안동경찰서', phone:'054-850-9350', email:'kb6bbse@police.go.kr' },
    { no:7, name:'김천경찰서', phone:'054-429-5359', email:'kb7bbse@police.go.kr' },
    { no:8, name:'영주경찰서', phone:'054-639-0346', email:'kb4806@police.go.kr' },
    { no:9, name:'영천경찰서', phone:'054-339-1253', email:'kb5904@police.go.kr' },
    { no:10, name:'상주경찰서', phone:'054-537-0345', email:'kb10bbse@police.go.kr' },
    { no:11, name:'문경경찰서', phone:'054-550-7250', email:'kb5306@police.go.kr' },
    { no:12, name:'칠곡경찰서', phone:'054-970-0345', email:'kbsk12@police.go.kr' },
    { no:13, name:'의성경찰서', phone:'054-830-8328', email:'kb6318@police.go.kr' },
    { no:14, name:'청도경찰서', phone:'054-370-1346', email:'kb5706@police.go.kr' },
    { no:15, name:'영덕경찰서', phone:'054-730-5346', email:'kb6006@police.go.kr' },
    { no:16, name:'울진경찰서', phone:'054-785-0346', email:'kb6106@police.go.kr' },
    { no:17, name:'봉화경찰서', phone:'054-679-0249', email:'kb6206@police.go.kr' },
    { no:18, name:'예천경찰서', phone:'054-650-2382', email:'kb6803@police.go.kr' },
    { no:19, name:'성주경찰서', phone:'054-930-0348', email:'kb6406@police.go.kr' },
    { no:20, name:'청송경찰서', phone:'054-870-2346', email:'kb7003@police.go.kr' },
    { no:21, name:'영양경찰서', phone:'054-680-0346', email:'kb0346@police.go.kr' },
    { no:22, name:'고령경찰서', phone:'054-950-1346', email:'gr347@police.go.kr' },
    { no:23, name:'울릉경찰서', phone:'054-790-3346', email:'kbdnffmd@police.go.kr' },
  ]},
  { region: '경남청', color: 'bg-red-700', stations: [
    { no:1, name:'창원중부경찰서', phone:'055-233-0346', email:'kn1bbse@police.go.kr' },
    { no:2, name:'창원서부경찰서', phone:'055-290-0246', email:'kn2bbse@police.go.kr' },
    { no:3, name:'마산중부경찰서', phone:'055-240-2260', email:'kn3bbse@police.go.kr' },
    { no:4, name:'마산동부경찰서', phone:'055-233-7238', email:'knsk4@police.go.kr' },
    { no:5, name:'진주경찰서', phone:'055-750-0346', email:'kn5bbse@police.go.kr' },
    { no:6, name:'김해중부경찰서', phone:'055-344-8346', email:'kn6bbse@police.go.kr' },
    { no:7, name:'김해서부경찰서', phone:'055-310-0185', email:'kn23bbse@police.go.kr' },
    { no:8, name:'양산경찰서', phone:'055-392-0217', email:'kn12bbse@police.go.kr' },
    { no:9, name:'거제경찰서', phone:'055-639-0174', email:'kn10bbse@police.go.kr' },
    { no:10, name:'진해경찰서', phone:'055-549-8292', email:'kn7bbse@police.go.kr' },
    { no:11, name:'통영경찰서', phone:'055-640-0217', email:'kn8bbse@police.go.kr' },
    { no:12, name:'사천경찰서', phone:'055-850-7335', email:'kn9bbse@police.go.kr' },
    { no:13, name:'밀양경찰서', phone:'055-350-0346', email:'kn11bbse@police.go.kr' },
    { no:14, name:'거창경찰서', phone:'055-949-0347', email:'kn13bbse@police.go.kr' },
    { no:15, name:'합천경찰서', phone:'055-930-6347', email:'kn14bbse@police.go.kr' },
    { no:16, name:'창녕경찰서', phone:'055-520-9345', email:'kn15bbse@police.go.kr' },
    { no:17, name:'고성경찰서', phone:'055-647-3347', email:'kn16bbse@police.go.kr' },
    { no:18, name:'하동경찰서', phone:'055-880-3346', email:'kn17bbse@police.go.kr' },
    { no:19, name:'남해경찰서', phone:'055-860-6258', email:'kn18bbse@police.go.kr' },
    { no:20, name:'함양경찰서', phone:'055-960-1246', email:'kn19bbse@police.go.kr' },
    { no:21, name:'산청경찰서', phone:'055-970-3346', email:'kn20bbse@police.go.kr' },
    { no:22, name:'함안경찰서', phone:'055-589-8249', email:'kn21bbse@police.go.kr' },
    { no:23, name:'의령경찰서', phone:'055-570-0346', email:'kn22bbse@police.go.kr' },
  ]},
  { region: '제주청', color: 'bg-emerald-700', stations: [
    { no:1, name:'제주동부경찰서', phone:'064-750-1347', email:'cj4106@police.go.kr' },
    { no:2, name:'제주서부경찰서', phone:'064-760-1595', email:'sb-bbse@police.go.kr' },
    { no:3, name:'서귀포경찰서', phone:'064-760-5346', email:'jj2bbse@police.go.kr' },
  ]},
]

const TIPS = [
  '배치신고: 배치 24시간 전까지 관할 경찰서 생활안전과에 신고 (경비업법 제18조)',
  '배치신고 방법: 방문·팩스·이메일 모두 가능 — 이메일 신고 시 이 목록 활용!',
  '경비원 신임교육: 배치 전 4시간 이상 이수 필수 (경비업법 제13조)',
  '배치폐지신고: 배치 폐지 후 7일 이내 신고',
  '경비업 허가 유효기간: 5년 (갱신 필요) — 만료 90일 전부터 갱신 신청 가능',
]

interface Props { onClose: () => void }

export default function ContactsModal({ onClose }: Props) {
  const [search, setSearch] = useState('')
  const [openRegions, setOpenRegions] = useState<Set<string>>(new Set(['서울청']))

  const toggleRegion = (r: string) => {
    setOpenRegions(prev => {
      const s = new Set(prev)
      s.has(r) ? s.delete(r) : s.add(r)
      return s
    })
  }

  const totalCount = DATA.reduce((s, r) => s + r.stations.length, 0)

  const filtered = useMemo(() => {
    if (!search.trim()) return DATA
    const q = search.trim()
    return DATA.map(r => ({
      ...r,
      stations: r.stations.filter(s =>
        s.name.includes(q) || s.phone.includes(q) || s.email.includes(q) || r.region.includes(q)
      ),
    })).filter(r => r.stations.length > 0)
  }, [search])

  const isSearching = search.trim().length > 0

  return (
    <div className="flex flex-col" style={{ maxHeight: '85vh' }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between p-5 bg-gradient-to-r from-blue-700 to-blue-900 rounded-t-2xl shrink-0">
        <div>
          <h2 className="text-lg font-extrabold text-white">📞 전국 경비업 담당 연락처</h2>
          <p className="text-blue-200 text-xs mt-0.5">
            전국 {totalCount}개 경찰서 경비업 담당 · 전화 · 이메일 · 2026년 기준
          </p>
        </div>
        <button onClick={onClose} className="text-blue-200 hover:text-white p-1 rounded-lg transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* 검색 */}
      <div className="p-3 border-b border-gray-100 bg-gray-50 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2 text-sm border-2 border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400"
            placeholder="경찰서명, 지역, 전화번호, 이메일 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {isSearching && (
          <p className="text-xs text-gray-500 mt-1.5 px-1">
            검색 결과: {filtered.reduce((s, r) => s + r.stations.length, 0)}개
          </p>
        )}
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map(region => {
          const isOpen = isSearching || openRegions.has(region.region)
          return (
            <div key={region.region} className="border-b border-gray-100">
              {/* 지방청 헤더 */}
              <button
                onClick={() => !isSearching && toggleRegion(region.region)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold text-white px-2.5 py-0.5 rounded-full ${region.color}`}>
                    {region.region}
                  </span>
                  <span className="text-xs text-gray-500">{region.stations.length}개 경찰서</span>
                </div>
                {!isSearching && (
                  isOpen
                    ? <ChevronUp className="h-4 w-4 text-gray-400" />
                    : <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>

              {/* 경찰서 목록 */}
              {isOpen && (
                <div className="divide-y divide-gray-50">
                  {region.stations.map(st => (
                    <div key={st.no} className="px-4 py-2.5 hover:bg-blue-50/40 transition-colors">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] text-gray-400 w-5 shrink-0">{st.no}</span>
                          <span className="text-sm font-semibold text-gray-800 truncate">{st.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          <a href={`tel:${st.phone}`}
                            className="flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 font-medium bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors"
                            onClick={e => e.stopPropagation()}>
                            <Phone className="h-3 w-3" />{st.phone}
                          </a>
                          <a href={`mailto:${st.email}`}
                            className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-medium bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg transition-colors"
                            onClick={e => e.stopPropagation()}>
                            <Mail className="h-3 w-3" />{st.email}
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 법령 팁 */}
      <div className="p-3 border-t-2 border-amber-200 bg-amber-50 rounded-b-2xl shrink-0">
        <p className="text-xs font-bold text-amber-700 mb-1.5">⚖️ 경비업법 핵심 체크포인트</p>
        <div className="space-y-0.5">
          {TIPS.map((tip, i) => (
            <p key={i} className="text-[11px] text-amber-800 leading-relaxed">• {tip}</p>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">출처: 2026년 전국 경찰서 경비업 담당자 전화번호 및 전자우편</p>
      </div>
    </div>
  )
}
