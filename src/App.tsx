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

const ANIMATION_TIME = 250

interface ParentNodeData {
    type: 'parent'
    id: string
    children: Children[]
    split: 'h' | 'v'
    parent: ParentNodeData | null
}
interface NodeData {
    type: 'node'
    id: string
    name: string
    parent: ParentNodeData | null
}

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
    flipOrigin?: boolean,
) {
    flipOrigin ??= false
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
                top: lastRect!.top, left: lastRect!.left, width: ["l", "r"].includes(dir) ? 0 : lastRect!.width, height: ['u', 'd'].includes(dir) ? 0 : lastRect!.height
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
            if (["u", "d"].includes(dir)) {
                dx = 0
                sx = 1;
                dy = lastRect.height / 2
                sy = 0
                if (dir === "u") {
                    dy *= -1
                }
            } else {
                dy = 0
                sy = 1;
                dx = lastRect.width / 2
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
                easing: 'ease-out',
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
        const borderSize = isSelected || isMovable ? 3 : 1

        const background = isSelected ? 'lightsalmon' : ''
        const borderColor = isMovable ? 'blue' : isSelected ? 'black' : 'orange'
        return `display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; outline: ${borderSize}px solid ${borderColor}; background-color: ${background}; border-radius: 5px;`
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

function traverse(tree: NodeData | ParentNodeData | null, dir: Dir): NodeData | null {
    if (tree == null) return null
    const parent = tree.parent
    if (!parent) return null
    const isSameSplitAsDirection =
        (['r', 'l'].includes(dir) && parent.split === 'h') ||
        (['u', 'd'].includes(dir) && parent.split === 'v')
    if (isSameSplitAsDirection) {
        const index = parent.children.indexOf(tree)
        const isNext = ['r', 'd'].includes(dir)
        const targetIndex = isNext ? index + 1 : index - 1
        if (targetIndex >= 0 && targetIndex < parent.children.length) {
            const target = parent.children[targetIndex]
            if (target.type === 'node') {
                return target
            } else {
                let firstChild = target.children.at(0)
                while (firstChild != null && firstChild.type !== 'node') {
                    firstChild = firstChild.children.at(0)
                }
                return firstChild ?? null
            }
        }
    }
    return traverse(parent, dir)
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
            traversedNode = traverse(node, dir)
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
                clone.animate([
                    { transform: `scale(1, 1)` },
                    { transform: finalScale }
                ],
                    {
                        duration: ANIMATION_TIME / 2,
                        easing: 'ease-out',
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
                        animateBoxes(boxRefs, initialSizes, finalSizes, parentDir === "h" ? "u" : "l", true)
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

                const nextNode = traverse(n, dir)
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
