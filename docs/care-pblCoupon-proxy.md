# 쿠폰 발행(pblCoupon · VD.MOVS0047) — 프록시를 사용할 프로젝트 연동 예시

목표는 `CouponBottom.js`의 `btnConfirm` 클릭으로 발생하는 `pblCoupon`(`tranId: VD.MOVS0047`) 호출에서, 연동 프로젝트의 로컬 더미(`server/dummy`)가 아니라 DataForge(proxy)에 저장한 응답을 보이게 하는 것입니다.

이제 모의 서버가 **해당 프로젝트의 요청 형식(`POST /api`)을 직접 처리**합니다.

- 요청 본문(`header`)에서 `tranId` 추출
- DataForge 저장 응답 조회
- `responseMessage` 구조로 반환

`로컬 모의 API` 카드의 **프로토콜 프로필**로 동작을 바꿀 수 있습니다.

- `트랜잭션 ID + responseMessage`: `header.tranId` 기반, 응답은 `responseMessage`(header·body) 형태
- `일반 JSON API (REST)`: `x-mock-key`/`mockKey`/`/api/{key}` 기반 + 원본 JSON 반환

## 가장 단순한 사용 모드 (권장)

게이트웨이를 끄고, **프록시를 사용할 프로젝트**가 API를 DataForge 모의 서버로 직접 호출하게 하는 방식입니다.

1. DataForge에서 `VD.MOVS0047`(또는 `pblCoupon`) API를 등록하고 기본 응답 저장

```json
{
  "resultCd": "S",
  "resultMsg": "쿠폰이 등록되었습니다"
}
```

2. DataForge 설정
- 모의 서버 사용: ON
- 모의 서버 포트: 예) `4780`
- 게이트웨이 사용: OFF
- (선택) **백엔드 서버 자동 실행**: 앱 설정(`proxy-app-config.json` 등)에서 업스트림 작업 폴더·포트를 지정할 수 있습니다. (UI에서 제거된 경우 설정 파일로만 변경)

3. 연동 프로젝트 실행 시 API 베이스가 DataForge를 가리키게 설정
- 예: `http://localhost:4780/api`
- (코드 수정이 아니라 실행/환경 설정으로 베이스 URL을 바꿀 수 있을 때)

4. `btnConfirm` 클릭 시 기대 결과
- `tranId=VD.MOVS0047` 요청 → DataForge 기본 응답(S) 반환

## 응답 형식

모의 서버는 연동 프로젝트가 기대하는 형식으로 아래처럼 반환합니다.

```json
{
  "responseMessage": {
    "header": { "tranId": "VD.MOVS0047" },
    "body": "{\"resultCd\":\"S\",\"resultMsg\":\"쿠폰이 등록되었습니다\"}"
  }
}
```

## 게이트웨이 모드는 언제 쓰나?

연동 프로젝트가 API 베이스 URL을 바꿀 수 없고, `localhost:7777` 같은 고정 URL만 쓸 수 있을 때 사용합니다.

- 게이트웨이: `7777`
- 업스트림(실제 백엔드): `7778`
- 모의 서버(DataForge): `4780`

즉, 고정 URL 제약이 있는 경우에만 게이트웨이를 켭니다.

## 별칭이 필요한 경우

요청 `tranId`와 DataForge API 이름이 다르면 `mockTranAliases`를 사용합니다.

```json
{
  "VD.MOVS0047": "pblCoupon"
}
```

## 빠른 점검 포인트

- `GET http://127.0.0.1:4780/mock/VD.MOVS0047` 가 저장 JSON을 반환하는지
- `POST /api` 요청의 본문 `header.tranId`가 실제로 `VD.MOVS0047`인지
- 기본 응답 슬롯(default)에 원하는 `S` 응답이 선택되어 있는지
