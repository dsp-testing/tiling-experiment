import {
    createContext,
    createSignal,
    For,
    onCleanup,
    onMount,
    Show,
    useContext,
    type Signal,
} from 'solid-js'
import './App.css'

type Children = ParentNodeData | NodeData

type Dir = 'u' | 'd' | 'r' | 'l'
type Plane = 'h' | 'v'

const ANIMATION_TIME = 250

interface ParentNodeData {
    type: 'parent'
    id: string
    children: Children[]
    split: Plane
    parent: ParentNodeData | null
}
interface NodeData {
    type: 'node'
    id: string
    name: string
    parent: ParentNodeData | null
}

function isDirectionHorizontal(dir: Dir) { return (['r', 'l'].includes(dir)) }
function isDirectionVertical(dir: Dir) { return (['d', 'u'].includes(dir)) }
function isInSamePlane(dir: Dir, plane: Plane) {
    return (isDirectionHorizontal(dir) && plane === "h") || (isDirectionVertical(dir) && plane === "v")
}
function isNext(dir: Dir) { return ['r', 'd'].includes(dir) }

const Ctx = createContext<{
    selectedNode: Signal<NodeData | null>
    movableNode: Signal<NodeData | null>
    boxRefs: Map<string, HTMLDivElement>
}>({
    selectedNode: [] as unknown as Signal<NodeData | null>,
    movableNode: [] as unknown as Signal<NodeData | null>,
    boxRefs: new Map(),
})

function getBoxSizes(refs: Map<string, HTMLDivElement>) {
    const sizeMap = new Map<string, DOMRect>()
    refs.forEach((v, k) => {
        const rect = v.getBoundingClientRect()
        sizeMap.set(k, rect)
    })
    return sizeMap
}

function animateBoxes(
    refs: Map<string, HTMLDivElement>,
    initialiSizes: Map<string, DOMRect>,
    finalSizes: Map<string, DOMRect>,
    dir: Dir,
) {
    refs.forEach((ref, key) => {
        const firstRect = initialiSizes.get(key)
        const lastRect = finalSizes.get(key)
        if (!lastRect) {
            return;
        }
        const initialRect: { top: number; left: number; width: number; height: number } = firstRect
            ? {
                top: firstRect.top,
                left: firstRect.left,
                width: firstRect.width,
                height: firstRect.height,
            }
            : {
                top: lastRect!.top, left: lastRect!.left, width: isDirectionHorizontal(dir) ? 0 : lastRect!.width, height: ['u', 'd'].includes(dir) ? 0 : lastRect!.height
            }

        if (!firstRect) {
            switch (dir) {
                case 'u':
                    initialRect.top += initialRect.height
                    break
                case 'd':
                    initialRect.top -= initialRect.height

                    break
                case 'l':
                    initialRect.left += initialRect.width
                    break
                case 'r':
                    initialRect.left -= initialRect.width
                    break
            }
        }

        const keyFrames: Keyframe[] = []
        if (firstRect) {
            const initialCenterX = initialRect.left + initialRect.width / 2
            const initialCenterY = initialRect.top + initialRect.height / 2

            const finalCenterX = lastRect.left + lastRect.width / 2
            const finalCenterY = lastRect.top + lastRect.height / 2

            const dx = initialCenterX - finalCenterX
            const dy = initialCenterY - finalCenterY
            const sx = lastRect.width ? initialRect.width / lastRect.width : 0
            const sy = lastRect.height ? initialRect.height / lastRect.height : 0
            keyFrames.push(
                { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
                { transform: 'translate(0, 0) scale(1, 1)' },
            )
        } else {
            let dx: number;
            let dy: number;
            let sx: number;
            let sy: number;
            if (isDirectionVertical(dir)) {
                dx = 0
                sx = 1;
                dy = lastRect.height / 4
                sy = 0
                if (dir === "u") {
                    dy *= -1
                }
            } else {
                dy = 0
                sy = 1;
                dx = lastRect.width / 4
                sx = 0
                if (dir === "l") {
                    dx *= -1
                }
            }
            keyFrames.push(
                { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, offset: 0 },
                { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, offset: 0.5 },
                { transform: 'translate(0, 0) scale(1, 1)' },
            )
        }
        ref.animate(
            keyFrames,
            {
                duration: ANIMATION_TIME,
                easing: 'ease-in-out',
            },
        )
    })
}

function Node(props: { node: NodeData }) {
    const ctx = useContext(Ctx)
    const [selectedNode, setSelectedNode] = ctx?.selectedNode
    const [movableNode] = ctx.movableNode
    const style = () => {
        const isSelected = selectedNode() === props.node
        const isMovable = movableNode() === props.node
        const emphasized = isSelected || isMovable

        const background = isMovable ? 'lightblue' : isSelected ? 'lightsalmon' : ''
        const borderColor = isMovable ? 'blue' : isSelected ? 'black' : 'orange'
        // Keep the border a constant 1px so layout never changes; draw the
        // thicker "selected" ring with an inset box-shadow, which is painted
        // inside the box and does not affect layout (no shift).
        const ring = emphasized ? ` box-shadow: inset 0 0 0 3px ${borderColor};` : ''
        return `display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 100%; height: 100%; border: 1px solid ${borderColor}; background-color: ${background}; border-radius: 5px;${ring}`
    }

    return (
        <div
            id={props.node.id}
            ref={(ref) => ctx.boxRefs.set(props.node.id, ref)}
            onClick={() => {
                setSelectedNode(props.node)
            }}
            style={style()}
        >
            {props.node.name}
        </div>
    )
}

function ParentNode(props: { node: ParentNodeData }) {
    const style = () => {
        let style = `display: flex; flex-direction: ${props.node.split === 'h' ? 'row' : 'column'}; height: 100%; width: 100%; gap: 5px;`
        return style
    }
    return (
        <div
            id={props.node.id}
            style={style()}
        >
            <For each={props.node.children}>
                {(child) => {
                    if (child.type === 'parent') {
                        return <ParentNode node={child} />
                    } else {
                        return <Node node={child} />
                    }
                }}
            </For>
        </div>
    )
}

function findClosestRect(el: HTMLDivElement, array: [string, HTMLDivElement][], dir: Plane) {
    const elBoundingClientRect = el.getBoundingClientRect()
    function doesOverlap(rect: DOMRect) {
        const doesOverlapHorizontally = (rect.left >= elBoundingClientRect.left && rect.left <= elBoundingClientRect.right) || (elBoundingClientRect.left >= rect.left && elBoundingClientRect.left <= rect.right)
        const doesOverlapVertically = (rect.top >= elBoundingClientRect.top && rect.top <= elBoundingClientRect.bottom) || (elBoundingClientRect.top >= rect.top && elBoundingClientRect.top <= rect.bottom)
        return doesOverlapHorizontally || doesOverlapVertically
    }
    const closestEl = array.reduce((closestElement, v) => {
        if (!closestElement) {
            return v
        }
        const rectForNextElement = v[1].getBoundingClientRect()
        if (!doesOverlap(rectForNextElement)) {
            return closestElement
        }
        const rectForClosestElement = closestElement[1].getBoundingClientRect();
        if (dir === "h") {
            const diffWithCurrentClosest = Math.abs(rectForClosestElement.left - elBoundingClientRect.left)
            const diffWithNextClosest = Math.abs(rectForNextElement.left - elBoundingClientRect.left)

            if (diffWithCurrentClosest > diffWithNextClosest) {
                return v
            }
        } else if (dir === "v") {
            const diffWithCurrentClosest = Math.abs(rectForClosestElement.top - elBoundingClientRect.top)
            const diffWithNextClosest = Math.abs(rectForNextElement.top - elBoundingClientRect.top)

            if (diffWithCurrentClosest > diffWithNextClosest) {
                return v
            }
        }

        return closestElement
    }, null as [string, HTMLDivElement] | null)
    return closestEl
}

function traverse(originLNode: NodeData | null, dir: Dir, refs: Map<string, HTMLDivElement>, tree?: NodeData | ParentNodeData | null): NodeData | null {
    if (originLNode == null) return null
    tree ??= originLNode
    const parent = tree.parent
    if (!parent) return null
    const isSameSplitAsDirection = isInSamePlane(dir, parent.split)
    if (isSameSplitAsDirection) {
        const index = parent.children.indexOf(tree)
        const targetIndex = isNext(dir) ? index + 1 : index - 1
        if (targetIndex >= 0 && targetIndex < parent.children.length) {
            const target = parent.children[targetIndex]
            if (target.type === 'node') {
                return target
            } else {
                const inputRef = refs.get(originLNode.id)
                if (!inputRef) {
                    console.error("Weird no ref for input", tree)
                    return null
                }
                const allNodesInOppositeDirection: NodeData[] = []
                function accumulateFurthestNodes(c: Children) {
                    if (c.type === "node") {
                        allNodesInOppositeDirection.push(c)
                        return
                    }
                    if (isInSamePlane(dir, c.split)) {
                        const idxToCheck = isNext(dir) ? 0 : -1

                        const child = c.children.at(idxToCheck);
                        if (!child) return
                        accumulateFurthestNodes(child)
                    } else {
                        c.children.forEach(accumulateFurthestNodes)
                    }
                }
                accumulateFurthestNodes(target)
                const nodes = allNodesInOppositeDirection.map(candidateChild => {
                    const ref = refs.get(candidateChild.id)
                    if (!ref) {
                        console.error("Weird, no ref", candidateChild)
                        return
                    }
                    return [candidateChild.id, ref, candidateChild] as const
                }).filter((v): v is [string, HTMLDivElement, NodeData] => v != null)


                const closestElement = findClosestRect(inputRef, nodes.map(n => [n[0], n[1]] as const), target.split)
                if (!closestElement) {
                    return null
                }
                return closestElement != null ? nodes.find(n => n[0] === closestElement[0])?.[2] ?? null : null
            }
        }
    }
    return traverse(originLNode, dir, refs, parent)
}

function remove(tree: NodeData) {
    // remove the node from the parent. If the parent only has this node, then merge it with its parent
    if (!tree.parent) throw new Error('No Parent!')
    const children = tree.parent.children
    const index = children.indexOf(tree)
    children.splice(index, 1)

    if (children.length === 1) {
        // No point in keeping this parent. Let's move the node up
        const parentsParent = tree.parent.parent
        if (parentsParent) {
            const parentsChildren = parentsParent.children
            const index = parentsChildren.indexOf(tree.parent)
            parentsChildren[index] = children[0]
            children[0].parent = parentsParent
        }
    }
}

function App() {
    const [tile, setTile] = createSignal<ParentNodeData | NodeData>({
        type: 'node',
        name: '0',
        parent: null,
        id: '0',
    })
    const [getSelectedNode, setSelectedNode] = createSignal<NodeData | null>(null)
    const [getMovableNode, setMovableNode] = createSignal<NodeData | null>(null)
    const [tileCount, setTileCount] = createSignal(0)
    const boxRefs = new Map<string, HTMLDivElement>()

    const onReset = () => {
        setTile({ type: 'node', name: '0', parent: null, id: '0' })
        setSelectedNode(null)
        setTileCount(0)
    }

    const rerender = (prev: Children) => {
        const newNode = { ...prev }
        if (newNode.type === 'parent') {
            newNode.children.forEach((child) => {
                child.parent = newNode
            })
        }
        return newNode
    }

    const onDelete = (inputNode?: NodeData, animate?: boolean): void => {
        animate ??= true;
        const node = inputNode ?? getSelectedNode()
        if (!node) return
        const parentDir = node.parent?.split
        const isFirst = node.parent?.children.indexOf(node) === 0
        let dirToTry: Dir[]
        if (parentDir === 'h') {
            dirToTry = ['l', 'r']
            if (isFirst) {
                dirToTry.reverse()
            }
            dirToTry.push('u', 'd')
        } else {
            dirToTry = ['u', 'd']
            if (isFirst) {
                dirToTry.reverse()
            }
            dirToTry.push('l', 'r')
        }

        let traversedNode: NodeData | null = null
        for (let i = 0; i < dirToTry.length; i++) {
            const dir = dirToTry[i]
            traversedNode = traverse(node, dir, boxRefs)
            if (traversedNode) break
        }
        const deleteNode = () => {
            remove(node)
            if (getMovableNode() === node) {
                setMovableNode(null)
            }
            setTile(rerender)
            boxRefs.delete(node.id)
        }

        if (!traversedNode) {
            console.error("Can't remove last node")
            return
        }
        if (animate) {
            const initialSizes = getBoxSizes(boxRefs)
            const deletableNodeSize = initialSizes.get(node.id);
            const deletableNodeRef = boxRefs.get(node.id)
            let clone: HTMLDivElement | null
            if (deletableNodeSize && deletableNodeRef) {
                clone = deletableNodeRef.cloneNode(true) as HTMLDivElement
                Object.assign(clone.style, {
                    left: `${deletableNodeSize.left}px`,
                    top: `${deletableNodeSize.top}px`,
                    width: `${deletableNodeSize.width}px`,
                    height: `${deletableNodeSize.height}px`,
                    position: 'fixed',
                    zIndex: 9999,
                })
                deletableNodeRef.style.visibility = 'hidden'
                document.body.appendChild(clone)
                const finalScale = parentDir == "h" ? 'scale(0, 1)' : 'scale(1, 0)'
                const isFirstChild = node.parent?.children.indexOf(node) === 0
                const isLastChild = node.parent && node.parent?.children.indexOf(node) === (node.parent?.children.length) - 1
                if (isFirstChild) {
                    clone.style.transformOrigin = "top left"
                } else if (isLastChild) {
                    clone.style.transformOrigin = "bottom right"
                }
                clone.animate([
                    { transform: `scale(1, 1)` },
                    { transform: finalScale }
                ],
                    {
                        duration: ANIMATION_TIME / 2,
                        easing: 'ease-in-out',
                        fill: 'forwards'
                    })
                    .finished.then(() => {
                        if (clone)
                            document.body.removeChild(clone);
                    });
                setTimeout(() => {
                    deleteNode()

                    requestAnimationFrame(() => {
                        const finalSizes = getBoxSizes(boxRefs)
                        animateBoxes(boxRefs, initialSizes, finalSizes, parentDir === "h" ? "u" : "l")
                    })
                    setTimeout(() => {
                        setSelectedNode(traversedNode)
                    }, ANIMATION_TIME * 0.8)
                }, ANIMATION_TIME * 0.1)
            }
        } else {
            deleteNode()
            setSelectedNode(traversedNode)
        }
    }

    const onClick = (dir: 'r' | 'l' | 'u' | 'd') => {
        const existingTile = getSelectedNode()
        if (!existingTile) return

        let movableNode = getMovableNode()
        if (movableNode == existingTile) {
            movableNode = null
        }
        const initialSizes = getBoxSizes(boxRefs)
        if (movableNode) {
            // first delete teh movable node, before moving it
            onDelete(movableNode, false)
        }
        const newTile: NodeData =
            movableNode != null
                ? { ...movableNode, parent: null }
                : {
                    type: 'node' as const,
                    name: (tileCount() + 1).toString(),
                    parent: null,
                    id: (tileCount() + 1).toString(),
                }
        setTileCount(tileCount() + 1)
        setSelectedNode(newTile)
        if (movableNode) {
            setMovableNode(newTile)
        }

        const currentParent = existingTile.parent
        const splitType = ['r', 'l'].includes(dir) ? 'h' : 'v'
        const next = ['d', 'r'].includes(dir)

        let nextRootTile: Children
        if (currentParent?.split === splitType) {
            // if same, just add it to the same container
            newTile.parent = currentParent
            const index = currentParent.children.indexOf(existingTile)
            const targetIndex = next ? index + 1 : index
            currentParent.children.splice(targetIndex, 0, newTile)
            nextRootTile = rerender(tile())
        } else {
            // otherwise, create a new container in the new flex-direction
            // then set the right parent etc
            const newParent: ParentNodeData = {
                type: 'parent' as const,
                children: next ? [existingTile, newTile] : [newTile, existingTile],
                split: splitType,
                parent: currentParent,
                id: Math.random().toString(),
            }
            existingTile.parent = newParent
            newTile.parent = newParent
            if (currentParent) {
                // If there already is a current parent
                const existingChildren = currentParent.children
                const index = currentParent.children.indexOf(existingTile)
                existingChildren[index] = newParent
                nextRootTile = rerender(tile())
            } else {
                nextRootTile = newParent
            }
        }
        // affected
        setTile(nextRootTile)
        requestAnimationFrame(() => {
            const finalSizes = getBoxSizes(boxRefs)
            animateBoxes(boxRefs, initialSizes, finalSizes, dir)
        })
    }

    const onMove = () => {
        const selectedNode = getSelectedNode()
        if (!selectedNode) return
        const movableNode = getMovableNode()

        if (movableNode === selectedNode) {
            setMovableNode(null)
            return
        } else {
            setMovableNode(selectedNode)
        }
    }
    onMount(() => {
        const keyDownEvent = (event: KeyboardEvent) => {
            if (event.key.toLocaleLowerCase() === 'r') {
                onReset()
                return
            }
            if (event.key.toLocaleLowerCase() === 'd') {
                onDelete()
                return
            }
            if (event.key.toLocaleLowerCase() === ' ') {
                onMove()
                event.preventDefault()
                return
            }
            if (event.key.toLocaleLowerCase() === "escape" && (!!getMovableNode() || !!getSelectedNode())) {
                event.preventDefault()
                if (getMovableNode()) {
                    setMovableNode(null)
                    return
                }
                setMovableNode(null)
                setSelectedNode(null)
                return;
            }
            const splitKey: Record<string, Dir> = {
                j: 'd',
                h: 'l',
                k: 'u',
                l: 'r',
                arrowleft: 'l',
                arrowup: 'u',
                arrowright: 'r',
                arrowdown: 'd',
            } as const
            const dir = splitKey[event.key.toLocaleLowerCase()]
            const handleSplit = () => {
                if (!dir) {
                    return
                }
                event.preventDefault()
                onClick(dir)
            }

            const handleTraversal = () => {
                if (!dir) {
                    return
                }
                event.preventDefault()
                const n = getSelectedNode()

                const nextNode = traverse(n, dir, boxRefs)
                if (nextNode) {
                    setSelectedNode(nextNode)
                }
            }

            if (event.shiftKey) {
                handleSplit()
            } else {
                handleTraversal()
            }
        }
        window.addEventListener('keydown', keyDownEvent)
        onCleanup(() => {
            window.removeEventListener('keydown', keyDownEvent)
        })
    })
    return (
        <Ctx.Provider
            value={{
                selectedNode: [getSelectedNode, setSelectedNode],
                movableNode: [getMovableNode, setMovableNode],
                boxRefs,
            }}
        >
            <div style="display: flex; flex-direction: column; height: 100%; width: 100%;">
                <div>
                    h/j/k/l for direction (or arrow keys); Hold shift and then press direction for new tile;
                    "d" for delete; Space for toggling movable node, then Shift+Direction to move; "r" for
                    reset
                </div>
                <div style="display: flex; height: 100%; width: 100%;">
                    <Show when={tile()} keyed>
                        {(currentTile) =>
                            currentTile.type === 'parent' ? (
                                <ParentNode node={currentTile} />
                            ) : (
                                <Node node={currentTile} />
                            )
                        }
                    </Show>
                </div>
            </div>
        </Ctx.Provider>
    )
}

export default App
