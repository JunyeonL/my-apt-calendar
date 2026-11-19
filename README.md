# 청약나침반 (My ApplyHome)

[![Update and deploy](https://github.com/JunyeonL/my-apt-calendar/actions/workflows/pages.yml/badge.svg)](https://github.com/JunyeonL/my-apt-calendar/actions/workflows/pages.yml)

한국부동산원 **청약홈 공식 공공데이터**를 GitHub Actions로 정기 수집하고 GitHub Pages에서 월간 달력으로 표시하는 **서버리스 개인용 청약 대시보드**입니다.

## 구현된 기능

- 월~금 5열 월간 달력: 특별공급, 본인 조건에 맞는 일반 1·2순위, 무순위/잔여세대 접수 일정. 주말 열은 표시하지 않습니다.
- 서울/경기/인천·전국 필터와 `1순위 해당지역 가능 / 1순위 기타지역 가능 / 2순위 가능 / 검토 필요` 예비 분류
- 통장 가입일·확인금액·납입횟수, 거주기간, 무주택 시작일, 혼인 연월·자녀 출생월, 세대주·세대 당첨 이력 등을 브라우저에 보관
- 기초 자격 **예비 판정**(절대 확정 자격 아님). 공고일 기준 통장 기간 및 관심 특별공급 유형 검토 힌트
- 모든 주택형의 **분양최고가·일반공급·특별공급·합계**를 한 표에 표시하고 다자녀·신생아 등 특별공급 세부 배정도 제공합니다. 수동 비교 시세·차액 기능은 제거했습니다.
- 모바일에서 목록 카드가 화면 너비를 넘지 않도록 줄바꿈하며, 넓은 공급 표는 팝업 안에서만 가로 스크롤합니다.
- 관심 단지 즐겨찾기, 청약홈 공식 상세 URL 새 탭 열기
- API 키가 없으면 **명확한 가상 데이터 체험 모드** 제공. 실제 공고인 것처럼 표시하지 않음
- 서드파티 프론트엔드 의존성 없음: 정적 HTML, CSS, JavaScript 모듈. 로그인·별도 서버·DB 없음

## 사용 전 필수 설정

1. 저장소 [`JunyeonL/my-apt-calendar`](https://github.com/JunyeonL/my-apt-calendar)의 `main` 브랜치에 전체 소스를 올립니다. 소유자가 승인한 개인 청약 기본값이 소스에 포함된 개인용 프로젝트입니다.
2. [공공데이터포털 청약홈 분양정보 API](https://www.data.go.kr/data/15098547/openapi.do)에 활용신청하여 발급받은 **일반 인증키**를 준비합니다.
3. [저장소 Actions secrets 설정](https://github.com/JunyeonL/my-apt-calendar/settings/secrets/actions)의 **New repository secret**에서 이름 `DATA_GO_KR_API_KEY`로 API 키를 입력합니다. Decoding/Encoding 형태 모두 지원합니다. 코드나 공개 JSON에 키를 기록하지 마세요.
4. **Settings → Pages → Build and deployment → Source: GitHub Actions**로 선택합니다.
5. [Actions 워크플로](https://github.com/JunyeonL/my-apt-calendar/actions/workflows/pages.yml)의 **Run workflow**를 실행합니다. `refresh_data`를 선택하면 공식 데이터를 수집합니다. 배포 주소는 `https://junyeonl.github.io/my-apt-calendar/`입니다.
6. 이후 자동으로 한국시간 **매일 08:30, 17:00**에 수집 및 배포합니다. Actions 예약 실행은 지연되거나 건너뛸 수 있습니다.

GitHub Actions `GITHUB_TOKEN`으로 커밋된 데이터 변경은 일반적으로 다른 workflow의 `push` 트리거를 재실행하지 않습니다. 따라서 이 프로젝트는 **하나의 workflow가 수집 → 데이터 커밋 → Pages 배포까지** 처리합니다.

`main`에 소스 변경을 푸시해도 같은 작업을 실행합니다. API 키가 없으면 Actions에 경고와 안내를 남기고 기존 데이터로 웹 앱을 배포합니다. 최초에는 실제 데이터 미수집 상태와 선택 가능한 가상 데이터 체험 모드가 표시됩니다. API 오류·불완전한 응답이 발생하면 데이터 교체와 배포를 중단하여 이전 배포를 유지합니다.

수집 작업은 한국시간 기준 모집공고일 전후 약 1년의 APT·무순위 공고와 주택형별 분양최고가를 정규화합니다. 수집과 빌드에는 `contents: write`, 배포에는 `pages: write`와 `id-token: write`를 작업별로 부여합니다. Pages 게시 소스를 GitHub Actions로 선택하는 최초 설정은 저장소 Settings에서 한 번 필요합니다.

## 최초 GitHub 업로드 (GitHub에 로그인된 PC에서)

```bash
# ZIP을 푼 프로젝트 폴더에서 실행
bash scripts/publish.sh
```

`git push`를 위한 GitHub 인증이 필요합니다. Git Credential Manager, SSH 또는 GitHub CLI 등을 통해 인증할 수 있습니다. ChatGPT 연결에서 `403 Resource not accessible by integration` 오류가 발생하는 경우, GitHub 원격 저장소의 문제가 아니라 연결 토큰의 쓰기 권한 문제일 수 있습니다.

## 로컬 실행

```bash
python3 -m http.server 8080
# http://localhost:8080
```

실제 데이터 수집 테스트:

```bash
export DATA_GO_KR_API_KEY="발급받은_인증키"
python3 scripts/fetch_applyhome.py
```

`DATA_GO_KR_API_KEY`가 없거나 API가 실패하면 기존 데이터를 덮어쓰지 않고 실패합니다. 실제 데이터가 수집되지 않았다면 체험 모드를 선택할 수 있습니다.

검증:

```bash
node --check app.js
node --test tests/eligibility.test.mjs
python3 -m unittest discover -s tests -v
```

## 자동 자격 판정 범위 및 한계

예비 판정은 **법적 청약 가능 여부를 확정하지 않습니다.** 공고 종류, 거주지역, 접수일, 가입 기간, 예치금 입력 정보를 통해 참고용으로 분류합니다. 특히 **소득·자산, 중복 신청, 생애최초, 세대주, 이전 당첨/재당첨, 전매/실거주 의무, 지역별 우선공급, 특공 배정**은 모집공고문으로 확인해야 합니다. 특별공급은 가급적 `검토 필요`로 분류합니다. 지역별 1순위 날짜도 공고마다 달라 반드시 확인해야 합니다.

일반공급 순위와 거주지 구분을 분리해 판단합니다. 1순위 요건 미충족이 확인되고 적용 가능한 2순위 접수일이 있는 경우 2순위로 표시합니다. 미확인 조건을 곧바로 2순위로 처리하지 않습니다. 규제지역 세대주·세대 당첨 이력, 공공주택 추가 자격 등은 미확인 시 검토 필요로 남기고 상세 체크리스트에 이유를 표시합니다.

주택형별 금액은 공식 API의 **분양최고금액(만원)**이며, 공급 인원은 **세대수**입니다. `0`은 배정 없음, `—`는 API 미제공입니다. 일반공급·특별공급 중 한쪽이 미제공이면 합계를 임의로 계산하지 않습니다.

원본 청약홈 상세 링크는 API `PBLANC_URL`을 보안 검증해 새 탭으로 엽니다. 청약홈의 세션/접근 정책에 따라 직접 연결이 막힐 수 있습니다. 타 사이트 상세 팝업을 그대로 iframe 삽입하는 기능은 제공하지 않습니다.

## 개인 정보

소유자가 승인한 개인 청약 기본값을 공개 소스에 포함하여 처음 접속할 때 자동 적용합니다. 예전 버전의 비어 있는 설정은 새 기본값으로 전환하고, 직접 입력하거나 불러온 실제 설정은 유지합니다. 이후 변경 내용·관심 단지는 현재 브라우저에 저장하며 `내 기본값으로 되돌리기`로 복원할 수 있습니다. 설정 파일 불러오기도 계속 지원합니다. 혼인일·자녀 출생일은 확인된 연월까지만 반영하며, 세대주·세대원 무주택·최근 당첨 이력은 확인되지 않았다면 미확인으로 둡니다. API 인증키·소득·연봉은 개인 기본값에 포함하지 않습니다.

## 데이터 출처

- [한국부동산원 청약홈 분양정보 오픈API](https://www.data.go.kr/data/15098547/openapi.do)
- [청약홈 공식 사이트](https://www.applyhome.co.kr/)
- [주택공급에 관한 규칙 제27조·제28조](https://www.law.go.kr/법령/주택공급에관한규칙)

`data/listings.json`은 공식 API 응답의 공개 필드를 가공한 JSON입니다. 키가 설정되기 전에는 빈 배열만 포함합니다.
