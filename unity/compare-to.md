# CompareTo는 누가 앞인지만 정한다 — List.Sort에 비교 넘기기

> Unity · C# 기초 · 2026-11-19 — 직접 눌러 보는 그림은 [compare-to.html](compare-to.html)
>
> 실습 원본: [unity-study / 07.CompareTo](https://github.com/DEV-JSB/unity-study/tree/main/Assets/Chapter/07.CompareTo)
>
> 앞 노트: [enum 두 개를 ulong 키 하나로](ulong-key.md)

## 발단

회사 프로젝트에서 아이템 리스트를 enum 등급 순서로 정렬한 적이 있다. `List.Sort`에 함수 하나를 넘기고, 그 안에서 `grade.CompareTo(...)`를 불렀다. 그때 기억에 남은 건 이 한 줄이었다.

> 수평선을 긋고, `-1`이면 왼쪽, `+1`이면 오른쪽.

오늘 이걸 빈손으로 꺼내 보니 그림은 맞는데 빈 곳이 세 군데 있었다. `0`(같을 때)이 빠져 있었고, `-1`과 `+1`만 나온다고 믿고 있었고, "`+1`이면 기준의 바로 옆 칸"이라고 이해하고 있었다. 그리고 "그때 기본 순서는 어디에 있었나?"를 물어보니 답을 못 했다.

**한 줄 결론: `CompareTo`는 두 개를 놓고 "누가 앞이냐"의 방향만 정한다. 최종 칸 번호는 `List.Sort`가 비교를 여러 번 해서 만든다. 정렬은 `List.Sort`에 맡기고 비교만 넘긴다.**

실습에 쓴 재료는 이 두 개다.

```csharp
public enum ItemGrade { Normal, Rare, Epic, Legend }  // 0, 1, 2, 3

public class SortItem : IComparable<SortItem>
{
    public readonly string itemName;
    public readonly ItemGrade grade;
}
```

## 1. 수평선 그림 — 기준은 괄호 안이다

`a.CompareTo(b)`는 **`b`를 수평선의 0 자리에 세워 두고, `a`가 어느 쪽에 떨어지는지** 묻는 것이다.

| `a.CompareTo(b)`의 결과 | 수평선에서 | 정렬에서 |
|---|---|---|
| 0보다 작은 값 | `b`의 왼쪽 | `a`가 `b`보다 앞 |
| 0 | `b`와 같은 자리 | 순서를 정하지 않음 |
| 0보다 큰 값 | `b`의 오른쪽 | `a`가 `b`보다 뒤 |

코드에서 왼쪽에 쓰인 `a`는 **자리를 정할 대상**이고, **기준**은 괄호 안의 `b`다. 둘을 바꿔 `b.CompareTo(a)`로 부르면 기준이 바뀌어서 부호가 반대로 나온다. 이게 6절의 "높은 순으로 바꾸기"의 열쇠가 된다.

## 2. 약속은 부호뿐이다 — `-1`, `1`이 아니다

.NET 문서가 약속하는 건 **"0보다 작다 / 0 / 0보다 크다"** 세 가지뿐이다 (공식 문서). `-1`과 `1`이 나와야 한다는 약속은 없다.

| 비교 방법 | `Legend(3)`과 `Normal(0)`을 비교하면 | 약속을 지키나 |
|---|---|---|
| `Legend.CompareTo(Normal)` (enum 기본) | 1 (.NET 9에서 실제로 찍어 본 값) | 지킴 |
| `(int)leftGrade - (int)rightGrade` (빼기로 짠 비교) | **3** | 지킴 |

두 번째 방법도 약속은 지킨다. 그래서 비교 결과를 받아 쓰는 쪽에서 `== 1`로 확인하면, 3이 나왔을 때 "뒤로 보내야 한다"를 놓친다. 결과를 쓰는 쪽은 항상 `> 0`, `< 0`으로 확인한다.

### 같을 때 0을 빠뜨리면

같을 때를 빠뜨린 비교 `leftItem.grade > rightItem.grade ? 1 : -1`을 검사기에 일부러 넣어 봤다. 실습 데이터에서는 **정렬 결과가 모두 맞게 나왔다.** 눈으로는 못 잡는다. 검사기는 "같은 아이템을 자기 자신과 비교하면 0인가"를 따로 확인해서 이걸 실패로 잡게 했다. 같은 두 값에 0을 안 돌려주는 비교는 데이터가 바뀌면 예외가 나거나 순서가 틀어질 수 있다 (공식 문서: 비교는 일관돼야 한다).

## 3. 방향만 알려 주고, 칸 수는 알려 주지 않는다

처음에는 "`a.CompareTo(b)`가 `+1`이면 `a`를 `b`의 한 칸 오른쪽(`b` + 1 칸)에 놓는다"고 이해했다. 실제 예로 따라가면 틀린다.

| 칸 번호 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| 정렬 전 | Legend | Normal | Rare | Epic |
| 정렬 후 (낮은 순) | Normal | Rare | Epic | Legend |

- `Legend.CompareTo(Normal)`은 양수다. 그래서 Legend는 Normal의 **오른쪽 어딘가**로 가야 한다
- "Normal + 1 칸"을 글자 그대로 따르면 Legend는 1번 칸에 가야 한다
- 실제 최종 자리는 3번 칸이다. 1번 칸에는 Rare가 와야 한다

Legend가 3번 칸까지 가는 건 비교 한 번으로 정해진 게 아니라, **Rare, Epic과도 각각 비교한 결과가 쌓여서** 정해진 것이다.

| 누가 | 하는 일 | 아는 범위 |
|---|---|---|
| `CompareTo` (또는 넘긴 비교 함수) | 두 개만 놓고 "누가 앞이냐" 판정 | 한 쌍의 방향 |
| `List.Sort` | 그 판정을 여러 번 불러서 최종 칸 번호를 만든다 | 리스트 전체 |

## 4. "그때 기본 순서는 어디에 있었나" — 세 층으로 나눠 보기

회사에서 쓴 코드는 이런 모양이었다.

```csharp
items.Sort(CompareByGrade);

private int CompareByGrade(SortItem leftItem, SortItem rightItem)
{
    return leftItem.grade.CompareTo(rightItem.grade);
}
```

이 한 줄 안에서 일하는 층을 나누면 세 개다.

| 층 | 누가 만든 것 | 하는 일 |
|---|---|---|
| 1. 정렬 알고리즘 | `List.Sort` 내부 (공식 문서: introsort) | 비교를 여러 번 불러서 칸을 옮긴다 |
| 2. 아이템 두 개 비교 | 내가 넘긴 함수 `CompareByGrade` | 두 아이템 중 누가 앞인지 |
| 3. 등급 두 개 비교 | enum 안에 원래 들어 있는 `CompareTo` | 등급 숫자가 작은 쪽이 앞 |

"내부에 구현돼 있던 기본 순서"는 **3층, enum의 기본 순서**다. enum은 원래 `IComparable`을 구현하고 있어서 숫자 값(Normal 0 ~ Legend 3) 기준의 순서가 처음부터 들어 있다 (공식 문서). `int`, `string`도 마찬가지다.

반대로 **`SortItem` 클래스 자신의 기본 순서는 그때 없었고, 없어도 됐다.** 함수를 넘기면 `List.Sort`는 넘긴 함수만 쓴다.

## 5. 정렬은 List.Sort에 맡기고, 비교만 넘긴다

실습은 `List.Sort`에 넘길 비교 메서드 세 개를 채우는 것으로 했다. 아래는 직접 채운 코드다.

```csharp
// 1. 등급 낮은 순 (Normal → Legend)
public static int CompareByGradeAscending(SortItem leftItem, SortItem rightItem)
{
    return leftItem.grade.CompareTo(rightItem.grade);
}

// 2. 등급 높은 순 (Legend → Normal)
public static int CompareByGradeDescending(SortItem leftItem, SortItem rightItem)
{
    return rightItem.grade.CompareTo(leftItem.grade);
}

// 3. 등급 높은 순, 등급이 같으면 이름 알파벳 순
public static int CompareByGradeDescendingThenName(SortItem leftItem, SortItem rightItem)
{
    int result = rightItem.grade.CompareTo(leftItem.grade);
    if (result == 0)
    {
        return leftItem.itemName.CompareTo(rightItem.itemName);
    }
    return result;
}
```

부르는 쪽은 한 줄이다. 이름 있는 메서드를 넘기든 람다(lambda)로 그 자리에서 쓰든 하는 일은 같다.

```csharp
items.Sort(ItemComparisons.CompareByGradeDescending);
items.Sort((leftItem, rightItem) => rightItem.grade.CompareTo(leftItem.grade));
```

3번 메서드의 마지막 줄은 처음에 `return rightItem.grade.CompareTo(leftItem.grade);`로 같은 비교를 한 번 더 했다. 이미 `result`에 구해 둔 값이라 `return result;`로 줄였다.

## 6. 높은 순 = 괄호 안팎 바꾸기

2번 메서드는 1번에서 **`leftItem`과 `rightItem`의 자리만 바꿨다.** 1절의 수평선으로 말하면 기준점을 바꾼 것이다.

| 메서드 | 0 자리(기준)에 선 것 | 움직이는 것 | Legend와 Normal을 넣으면 |
|---|---|---|---|
| 낮은 순 | `rightItem` | `leftItem` | Legend가 Normal의 오른쪽 → Legend가 뒤 |
| 높은 순 | `leftItem` | `rightItem` | 부호가 반대 → Legend가 앞 |

`-(leftItem.grade.CompareTo(rightItem.grade))`처럼 결과에 마이너스를 붙이는 방법도 있다. 다만 결과가 `int.MinValue`이면 마이너스를 붙여도 양수가 되지 않는다 (공식 문서: 정수 오버플로). enum 기본 비교에서는 생기지 않지만, 괄호 안팎을 바꾸는 쪽이 그런 걱정이 없다.

## 7. 같은 등급끼리의 순서 — 기준을 하나 더 넣는다

`List.Sort`는 비교 결과가 0인 것끼리의 순서를 지켜 주지 않는다 (공식 문서: 불안정 정렬, unstable sort). 같은 Epic인 Sword와 Bow가 정렬할 때마다 어느 쪽이 앞에 올지 보장되지 않는다.

그래서 3번 메서드처럼 1차 기준(등급)이 같을 때만 2차 기준(이름)을 본다.

| 정렬 전 | 1, 2번 메서드가 보장하는 것 | 3번 메서드의 결과 |
|---|---|---|
| Sword(Epic), Axe(Normal), Bow(Epic), Ring(Legend), Cap(Normal), Dagger(Rare) | 등급 순서만 | Ring, Bow, Sword, Dagger, Axe, Cap |

이름 비교에 쓴 `string.CompareTo`는 **그 PC의 언어 설정(culture)에 따라** 순서를 정한다 (공식 문서). 어느 PC에서든 같은 결과가 나와야 하는 게임 데이터 정렬에서는 `string.CompareOrdinal`을 쓰는 경우가 많다 (공식 문서 권장 + 커뮤니티 표준).

## 8. 아무것도 안 넘기면 — 이름이 아니라 약속을 본다

`items.Sort()`처럼 아무것도 안 넘기면, `List.Sort`는 `SortItem` 자신의 `CompareTo`로 비교한다. 이걸 확인하려고 실험을 하나 했다. **`CompareTo` 메서드는 그대로 두고, 클래스 선언의 `: IComparable<SortItem>`만 지웠다.**

| `SortItem` 상태 | `items.Sort()` 결과 |
|---|---|
| `: IComparable<SortItem>` 있음 + `CompareTo` 있음 | `CompareTo`로 정렬됨 |
| `: IComparable<SortItem>` 없음 + `CompareTo` 있음 | 예외 (`InvalidOperationException`) |
| `items.Sort(비교 메서드)`로 넘김 | 인터페이스가 있든 없든 넘긴 함수만 씀 |

메서드가 그대로 있는데도 못 찾았다. `List.Sort()`는 "`CompareTo`라는 **이름의 메서드**가 있나?"를 찾지 않고, "이 타입이 `IComparable<T>`라는 **약속(interface)에 서명했나?**"만 본다 (공식 문서: 기본 비교자 `Comparer<T>.Default`가 `IComparable<T>` 또는 `IComparable` 구현을 찾고, 없으면 예외).

## 정리

1. `a.CompareTo(b)`는 `b`를 0 자리에 세우고 `a`가 어느 쪽인지 돌려준다. 기준은 괄호 안이다
2. 약속은 "음수 / 0 / 양수"뿐이다. 결과를 쓰는 쪽은 `== 1`이 아니라 `> 0`, `< 0`으로 확인한다
3. `CompareTo`는 방향만 알려 준다. 최종 칸 번호는 `List.Sort`가 여러 번 비교해서 만든다
4. 정렬은 `items.Sort(비교 메서드)`에 맡기고 비교만 넘긴다. enum, `int`, `string`은 기본 순서가 이미 들어 있어서 그 `CompareTo`를 부르면 된다
5. 높은 순은 괄호 안팎을 바꿔서(기준점을 바꿔서) 만든다
6. `List.Sort`는 같은 것끼리의 순서를 보장하지 않는다. 필요하면 2차 기준을 넣는다
7. 아무것도 안 넘긴 `items.Sort()`는 메서드 이름이 아니라 `IComparable<T>` 약속을 본다

## 더 보기

- [enum 두 개를 ulong 키 하나로](ulong-key.md) — 같은 `ItemType` · `Grade` enum을 키로 묶은 노트
