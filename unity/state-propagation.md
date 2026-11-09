# 상태 전파 — event, static, ReactiveProperty

> Unity · 설계 · 2026-08-09 — 그림 버전은 [state-propagation.html](state-propagation.html)
>
> 실습 원본: [unity-study / 03.StatePropagation](https://github.com/DEV-JSB/unity-study/tree/main/Assets/Chapter/03.StatePropagation)

`SkinIndex`가 바뀌면 초상화와 SD 프리뷰가 따라 바뀌어야 했다. `UI_Skin`에 `SkinIndex`를 두고 이벤트를 붙였더니 조언이 왔다.

> 앞으로 다른 로직도 인덱스에 따라 움직일 텐데, 계속 물고 늘어지면 `UI_Skin`이 너무 무거워진다. 그럴 때 쓰는 게 UniRx다.
>
> 점수가 바뀌면 각자 알아서 인지해야지, 전광판이 관중 한 명 한 명에게 알려주러 다니는 건 좋은 구조가 아니다.

그래서 **야구 전광판**으로 같은 요구사항(점수가 바뀌면 전광판과 관중이 각자 반응)을 **다섯 구조로** 만들어 비교했다. 실무에서 쓰던 `static` 방식도 넣었다.

**한 줄 결론: 통지(event ↔ ReactiveProperty)와 접근(static ↔ 인스턴스 ↔ SO)은 별개의 축이다. UniRx는 통지만 풀어 준다.**

## 1. 무엇으로 비교하나

1·2편은 Profiler 숫자가 심판이었다. 설계엔 그런 심판이 없다. 그래서 기준을 하나 정했다 (취향 · 바꿔도 됨):

> **기능을 하나 더 붙일 때 손대야 하는 곳이 몇 군데인가**

## 2. 다섯 구조

| # | 구조 | 파일 | 누가 누구를 아나 |
|---|---|---|---|
| 1 | 전광판이 점수·이벤트 모두 소유 | `ElectronicDisplayBoard1`, `Tourist1` | 전광판 → 관중 목록 |
| 2 | `static` 클래스로 점수 분리 | `ScoreSystem`, `ScoreJudgment`, `ElectronicDisplayBoard2`, `Tourist2` | 모두 → `ScoreSystem` (전역) |
| 3 | 인스턴스 + 직렬화 참조 | `NonStaticScoreSystem`, `ElectronicDisplayBoard3`, `Tourist3` | 구독자 → 시스템 |
| 4 | 3번 + UniRx `ReactiveProperty` | `NonStaticScoreSystem2`, `ElectronicDisplayBoard4`, `Tourist4` | 구독자 → 시스템 |
| 5 | ScriptableObject + `ReactiveProperty` | `ReactiveScoreSystemAsset`, `ElectronicDisplayBoard5`, `Tourist5` | 구독자 → SO 에셋 |

```
1번                                   2·3·4·5번
┌──────────────────────────┐          점수 넣는 쪽 (입력)
│ 전광판                    │                 │
│  입력·상태·표시·구독 관리 │                 ▼
│  List<Tourist> ──► 관중 A │          점수 시스템 (상태)  ◄── 아무도 등록 안 해 줌
│                ──► 관중 B │            ▲        ▲
│        (빠뜨리면 조용히 X)│          전광판     관중 A, B …  (각자 구독)
└──────────────────────────┘
```

### 2~5번은 그림이 같다 — 코드에서 어디가 다른가

화살표 방향(관중 → 시스템)은 2~5번이 모두 같다. 다른 건 **아래 네 칸 중 어느 칸이냐**다. 한 번에 한 칸씩만 바뀐다.

| | 시스템 선언 | 관중이 시스템을 찾는 법 | 구독 | 구독 해제 |
|---|---|---|---|---|
| 2번 | `public static class ScoreSystem` | 변수 없음. **클래스 이름으로 바로** `ScoreSystem.` | `ScoreSystem.OnTeam1ScoreChanged += …` | `OnDestroy`에서 `-=` |
| 3번 | `public class NonStaticScoreSystem : MonoBehaviour` | **`[SerializeField]` 변수**에 씬의 시스템 오브젝트를 끌어다 꽂음 | `_system.OnTeam1ScoreChanged += …` | `OnDestroy`에서 `-=` |
| 4번 | 3번과 같음 (`event` → `ReactiveProperty`) | 3번과 같음 | **`_system.SamsungScore.Subscribe(…)`** | **`.AddTo(this)`** — `OnDestroy` 없음 |
| 5번 | **`public class ReactiveScoreSystemAsset : ScriptableObject`** | `[SerializeField]` 변수에 **프로젝트 창의 `.asset` 파일**을 끌어다 꽂음 | 4번과 같음 | 4번과 같음 |

- 2 → 3: **찾는 법**이 바뀜 (클래스 이름 → 참조 변수)
- 3 → 4: **구독·해제**가 바뀜 (`+=` / `-=` → `Subscribe` / `AddTo`)
- 4 → 5: **시스템이 사는 곳**이 바뀜 (씬 오브젝트 → 에셋 파일)

아래 코드는 실습 코드에서 삼성 점수 부분만 남겼다. 한화 점수도 똑같은 코드라 생략.

### 1번 — 전광판이 다 들고 있다

전체 코드: [ElectronicDisplayBoard1.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/ElectronicDisplayBoard1.cs) · [Tourist1.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/Tourist1.cs)

- 전광판이 **입력 · 상태 · 표시 · 구독자 관리**를 모두 한다
- 관중이 늘면 전광판 리스트에 등록해야 하고, **빠뜨리면 아무 말 없이 안 됨**

```csharp
// 전광판 (ElectronicDisplayBoard1) — 점수, 이벤트, 관중 목록, 입력을 전부 가짐
private int _team1Score;
public event Action<ETeam, int> OnTeam1ScoreChanged;
[SerializeField] private List<Tourist1> _tourist;     // 관중 목록을 인스펙터에서 채움

private void Start()
{
    foreach (var tourist in _tourist)
        tourist.Init(this);                           // 전광판이 관중을 하나씩 등록시켜 줌
}

private void Update()
{
    if (Input.GetKeyDown(KeyCode.S))                  // 입력도 전광판이 받음
    {
        ++_team1Score;
        if (OnTeam1ScoreChanged != null)
            OnTeam1ScoreChanged.Invoke(ETeam.Samsung, _team1Score);
    }
}
```

```csharp
// 관중 (Tourist1) — 전광판이 Init을 불러 줘야만 구독된다
private ElectronicDisplayBoard1 _board;

public void Init(ElectronicDisplayBoard1 board)
{
    _board = board;
    board.OnTeam1ScoreChanged += OnTeamScoreChanged;
}

private void OnDestroy()
{
    if (_board == null) return;
    _board.OnTeam1ScoreChanged -= OnTeamScoreChanged;
}
```

### 2번 — static으로 상태를 떼어냄

전체 코드: [ScoreSystem.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/ScoreSystem.cs) · [ScoreJudgment.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/ScoreJudgment.cs) · [ElectronicDisplayBoard2.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/ElectronicDisplayBoard2.cs) · [Tourist2.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/Tourist2.cs)

- `ScoreJudgment(입력) → ScoreSystem(상태) → 전광판·관중(반응)`
- 전광판·관중이 **각자 구독**. `ScoreSystem`은 누가 보는지 모르고 알 필요도 없다 → 관중이 100명이 돼도 `ScoreSystem`은 0줄 변경
- 처음 들은 "각자 알아서 인지"가 이 구조

```csharp
// 시스템 (ScoreSystem) — static 클래스. 씬에 놓을 필요가 없다
public static class ScoreSystem
{
    private static int _team1Score = 0;
    public static event Action<ETeam, int> OnTeam1ScoreChanged;

    public static void AddTeamScore(ETeam team, int score)
    {
        _team1Score += score;
        if (OnTeam1ScoreChanged != null)
            OnTeam1ScoreChanged.Invoke(ETeam.Samsung, _team1Score);
    }
}
```

```csharp
// 점수 넣는 쪽 (ScoreJudgment) — 참조 없이 클래스 이름으로 바로 부름
if (Input.GetKeyDown(KeyCode.S))
    ScoreSystem.AddTeamScore(ETeam.Samsung, 1);
```

```csharp
// 관중 (Tourist2) — 참조 변수가 없다. 클래스 이름으로 바로 구독
private void Start()     { ScoreSystem.OnTeam1ScoreChanged += OnTeamScoreChanged; }
private void OnDestroy() { ScoreSystem.OnTeam1ScoreChanged -= OnTeamScoreChanged; }
```

### 3번 — static을 빼고 인스턴스로

전체 코드: [NonStaticScoreSystem.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/NonStaticScoreSystem.cs) · [ElectronicDisplayBoard3.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/ElectronicDisplayBoard3.cs) · [Tourist3.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/Tourist3.cs)

- 씬에 인스턴스 하나, 구독자는 `[SerializeField]`로 참조를 받아 스스로 구독
- 1번과 비슷해 보이지만 **의존 방향이 반대**: 1번은 전광판이 관중을 알고, 3번은 관중이 시스템을 안다
- **참조를 갖는 것 ≠ 등록해 주는 것**

```csharp
// 시스템 (NonStaticScoreSystem) — 씬 오브젝트에 붙이는 MonoBehaviour. static이 하나도 없다
public class NonStaticScoreSystem : MonoBehaviour
{
    private int _team1Score = 0;
    public event Action<ETeam, int> OnTeam1ScoreChanged;

    public void AddTeamScore(ETeam team, int score)
    {
        _team1Score += score;
        if (OnTeam1ScoreChanged != null)
            OnTeam1ScoreChanged.Invoke(ETeam.Samsung, _team1Score);
    }
}
```

```csharp
// 관중 (Tourist3) — 인스펙터에서 씬의 시스템 오브젝트를 끌어다 꽂아 둔 변수로 구독
[SerializeField] private NonStaticScoreSystem _system;

private void Start() { _system.OnTeam1ScoreChanged += OnTeamScoreChanged; }

private void OnDestroy()
{
    if (_system == null) return;
    _system.OnTeam1ScoreChanged -= OnTeamScoreChanged;
}
```

- 2번 관중과 비교하면 `ScoreSystem.` 자리가 `_system.`으로 바뀌고, 그 변수를 채우는 `[SerializeField]` 한 줄이 늘었다. 이게 3번의 전부다
- 점수 넣는 쪽은 실습 코드에 없다 (`ScoreJudgment`는 2번의 static `ScoreSystem`만 부른다). 넣는다면 이쪽도 `[SerializeField] NonStaticScoreSystem _system;`을 받아 `_system.AddTeamScore(...)`를 불러야 한다

### 4번 — UniRx를 얹음

전체 코드: [NonStaticScoreSystem2.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/NonStaticScoreSystem2.cs) · [ElectronicDisplayBoard4.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/ElectronicDisplayBoard4.cs) · [Tourist4.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/Tourist4.cs)

3번에서 **통지만** 바꿨다. 한 번에 하나만 바꿔야 차이가 UniRx 몫인지 안다.

```csharp
// 시스템 (NonStaticScoreSystem2) — 3번과 같은 MonoBehaviour. event 대신 ReactiveProperty
private readonly ReactiveProperty<int> _samsungScore = new ReactiveProperty<int>();
public IReadOnlyReactiveProperty<int> SamsungScore => _samsungScore;   // 밖에선 읽기·구독만

public void AddScore(ETeam team, int score)
{
    _samsungScore.Value += score;    // 값만 바꾸면 알림은 알아서 간다
}

private void OnDestroy() { _samsungScore.Dispose(); }
```

```csharp
// 관중 (Tourist4) — 참조 받는 법은 3번과 같다. 구독·해제만 바뀜
[SerializeField] private NonStaticScoreSystem2 _system;

private void Start()
{
    _system.SamsungScore
        .Subscribe(score => OnTeamScoreChanged(ETeam.Samsung, score))
        .AddTo(this);                // 이 오브젝트가 파괴되면 구독도 끊김
}
// OnDestroy가 없다 — AddTo(this)가 대신 해 준다
```

| event (3번) | ReactiveProperty (4번) |
|---|---|
| `Action` 따로 선언 | 필요 없음 |
| `if (Event != null) Event.Invoke(...)` | `.Value += score;` 한 줄 |
| 구독자마다 `OnDestroy`에서 `-=` | `AddTo(this)`로 통째로 사라짐 |
| 밖에서 값 변경을 막으려면 직접 설계 | `IReadOnlyReactiveProperty`로 내보내면 끝 |
| 구독해도 다음 득점 전까진 점수를 모름 → 첫 득점 전 빈 화면 | `Subscribe` 순간 **현재값이 즉시 한 번** 들어옴 |

### 5번 — ScriptableObject

전체 코드: [ReactiveScoreSystemAsset.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/ReactiveScoreSystemAsset.cs) · [ElectronicDisplayBoard5.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/ElectronicDisplayBoard5.cs) · [Tourist5.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/03.StatePropagation/Tourist5.cs)

- 접근 축을 바꾼 버전. SO 에셋 하나를 구독자들이 참조
- `ReactiveProperty`는 필드 초기화가 아니라 **`OnEnable`에서 `new`, `OnDisable`에서 `Dispose`** (이유는 4절)

```csharp
// 시스템 (ReactiveScoreSystemAsset) — ScriptableObject. 프로젝트 창에서 .asset 파일로 만든다
[CreateAssetMenu(fileName = "ScoreSystem", menuName = "Study/ScoreSystem")]
public class ReactiveScoreSystemAsset : ScriptableObject
{
    private ReactiveProperty<int> _samsungScore;
    public IReadOnlyReactiveProperty<int> SamsungScore => _samsungScore;

    private void OnEnable()          // 필드 초기화 대신 여기서 만든다 → 플레이마다 0부터
    {
        _samsungScore = new ReactiveProperty<int>(0);
    }

    private void OnDisable()
    {
        if (_samsungScore != null) _samsungScore.Dispose();
    }

    public void AddScore(ETeam team, int score) { _samsungScore.Value += score; }
}
```

```csharp
// 관중 (Tourist5) — 4번과 글자까지 거의 같다. 꽂는 대상이 씬 오브젝트가 아니라 .asset 파일
[SerializeField] private ReactiveScoreSystemAsset _system;

private void Start()
{
    _system.SamsungScore
        .Subscribe(score => OnTeamScoreChanged(ETeam.Samsung, score))
        .AddTo(this);
}
```

- 4번 관중과 다른 건 변수 타입(`NonStaticScoreSystem2` → `ReactiveScoreSystemAsset`) 하나뿐. 차이는 관중 코드가 아니라 **시스템이 어디 사느냐**(씬 → 프로젝트 에셋)에 있다
- 그래서 관중을 프리팹으로 만들어도 이 칸에 `.asset`을 미리 꽂아 둘 수 있다 (프리팹은 씬 오브젝트를 참조할 수 없음, 4절)
- 점수 넣는 쪽은 3번처럼 실습 코드에 없다

## 3. 통지와 접근은 별개다 — 제일 큰 깨달음

처음엔 둘을 하나로 보고 "UniRx를 쓰면 둘 다 해결"이라고 오해했다.

| 접근 ＼ 통지 | `event` | `ReactiveProperty` |
|---|---|---|
| UI가 소유 | 1번 | — |
| `static` | 2번 | — |
| 인스턴스 + 참조 | 3번 | 4번 |
| `ScriptableObject` | — | 5번 |

- **UniRx는 통지를 간편·안전하게 해 줄 뿐, 상태를 어디 둘지는 여전히 내가 정한다**
- `UI_Skin`이 무거워진 원인은 **UI가 상태를 소유한 것**이었고, 그건 이미 2번(상태 분리)에서 풀렸다. UniRx는 그 위의 편의
- 빈 칸(`static` + ReactiveProperty 등)은 이번에 안 만든 조합. 만들 수 없는 게 아니다

## 4. 접근 축의 트레이드오프

| | static | 인스턴스 | ScriptableObject |
|---|---|---|---|
| 수명 | 프로그램 전체. 씬이 바뀌어도 값·구독이 남음 | **씬과 함께 태어나고 죽음** (가장 명확) | static과 비슷하게 오래 남음 |
| 리셋 | 직접 만들고, **누가 언제 부를지까지 관리**. 빠뜨려도 컴파일되고 조용히 이전 값 | 필요 없음 | 에디터에선 플레이 중 바뀐 값이 에셋에 남음 → `OnEnable`에서 다시 `new` |
| 참조 전달 | **필요 없음** (전역 접근) | 구독자마다 직렬화로 넣어 줘야 함 | 에셋이라 **프리팹에도 미리 연결** |
| 몇 벌 | 하나뿐 | 여러 개 | **여러 벌** (에셋을 여러 개) |
| 어디서 쓰나 추적 | 어렵다 | 참조를 따라가면 됨 | 참조를 따라가면 됨 |

- **프리팹은 씬 오브젝트를 참조할 수 없다** (엔진 표준) → 3·4번은 런타임에 생성되는 관중에게 참조를 미리 꽂을 수 없다. SO는 가능
- 원래 문제 `SkinIndex`도 캐릭터를 **동시에 둘 이상** 보여 주는 순간 static으로는 막힌다

## 5. 결론

- UniRx 구독은 매우 편했고 앞으로 기본으로 깔고 가고 싶다 (취향 · 바꿔도 됨)
- 하지만 **의존성과 책임을 어떻게 나눌지는 UniRx가 답해 주지 않는다** — 생명주기, 필요한 개수, 프리팹 여부로 정한다
- 정답 하나가 아니라 **"이런 상황엔 이걸"**이라는 판단만 남는다

| 이런 상황이면 | 먼저 떠올릴 것 |
|---|---|
| 하나뿐이고, 씬과 무관하게 살아도 되고, 참조 전달이 귀찮다 | static (리셋 책임을 같이 짊어짐) |
| 씬 안에서만 살고 씬과 같이 사라져야 한다 | 인스턴스 + 참조 |
| 여러 벌이 필요하거나, 런타임 생성 프리팹이 구독해야 한다 | ScriptableObject |
| 어떤 경우든 "바뀌면 알려줘"가 필요하다 | `ReactiveProperty` (통지 축은 따로 고름) |

## 더 보기

- [문자열과 GC](string-gc.md) — 2편. "값이 바뀔 때만 갱신"이 여기선 구조가 됨 (`ReactiveProperty`는 같은 값이면 알리지 않음)
