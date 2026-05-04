# Care 쿠폰 발행(pblCoupon · VD.MOVS0047) 연동 가이드

목표는 `CouponBottom.js`의 `btnConfirm` 클릭으로 발생하는 `pblCoupon`(`tranId: VD.MOVS0047`) 호출에서, Care 더미(`server/dummy`)가 아니라 DataForge(proxy)에 저장한 응답을 보이게 하는 것입니다.

이제 모의 서버가 **Care 요청 형식(`POST /api`)을 직접 처리**합니다.

- 요청 본문(`header`)에서 `tranId` 추출
- DataForge 저장 응답 조회
- `responseMessage` 봉투 형식으로 반환

`로컬 모의 API` 카드의 **프로토콜 프로필**로 동작을 바꿀 수 있습니다.

- `레거시 트랜 봉투 (Care/SFD)`: `header.tranId` 기반 + `responseMessage` 봉투
- `일반 JSON API (REST)`: `x-mock-key`/`mockKey`/`/api/{key}` 기반 + 원본 JSON 반환

## 가장 단순한 사용 모드 (권장)

게이트웨이를 끄고, Care가 API를 DataForge 모의 서버로 직접 보게 하는 방식입니다.

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
- (선택) **Care 서버 자동 실행**: 홈의 「로컬 모의 API」카드에서 `dummy.server.js` 폴더(예: `~/git/care/server`)·Care listen 포트(예: `7778`)를 저장한 뒤 자동 실행을 켭니다. 모의 서버를 켤 때 함께 뜨고, 끌 때 함께 종료됩니다. 게이트웨이의 「업스트림 자동 실행」을 켜 두면 이 옵션은 무시됩니다.

3. Care 실행 시 API 베이스가 DataForge를 가리키게 설정
- 예: `http://localhost:4780/api`
- (코드 수정이 아니라 실행/환경 설정으로 베이스 URL을 바꿀 수 있을 때)

4. `btnConfirm` 클릭 시 기대 결과
- `tranId=VD.MOVS0047` 요청 → DataForge 기본 응답(S) 반환

## 응답 형식

모의 서버는 Care와 맞추기 위해 아래 형식으로 반환합니다.

```json
{
  "responseMessage": {
    "header": { "tranId": "VD.MOVS0047" },
    "body": "{\"resultCd\":\"S\",\"resultMsg\":\"쿠폰이 등록되었습니다\"}"
  }
}
```

## 게이트웨이 모드는 언제 쓰나?

Care가 API 베이스 URL을 외부 설정으로 바꿀 수 없고, `localhost:7777` 같은 고정 URL만 쓸 수 있을 때 사용합니다.

- 게이트웨이: `7777`
- 업스트림(Care 서버): `7778`
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
